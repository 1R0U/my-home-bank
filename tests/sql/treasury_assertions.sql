-- 素のPostgreSQLでWalletの安全整数上限とfamily_id保護を実行して確認する。
\set ON_ERROR_STOP on

begin;

insert into public.users (id, name, role, balance)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '金庫検証用の親', 'parent', 0);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

do $$
declare
  v_user_id constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_family_id uuid;
  v_wallet_balance numeric;
  v_treasury_balance bigint;
  v_transaction_count integer;
  v_message text;
begin
  v_family_id := public.create_family_with_treasury('Wallet上限テスト', 3000000000, 'test-family-safe-integer');
  update public.guild_treasuries
  set minimum_reserve_rate = 0
  where family_id = v_family_id;

  perform private.transfer_treasury_wallet(
    v_family_id, v_user_id, v_user_id, 2147483648,
    'treasury_to_wallet', 'quest_reward', 'int4上限を超える送金', 'test-over-int4'
  );

  select balance into v_wallet_balance from public.users where id = v_user_id;
  if v_wallet_balance <> 2147483648 then
    raise exception 'numeric型Walletへの送金が保存されませんでした';
  end if;

  -- 他の家族メンバーの残高も合算される将来の参加フローを想定し、
  -- Walletが安全整数上限に達した状態で追加送金を拒否できることを確認する。
  update public.users
  set balance = 9007199254740991
  where id = v_user_id;

  begin
    perform private.transfer_treasury_wallet(
      v_family_id, v_user_id, v_user_id, 1,
      'treasury_to_wallet', 'quest_reward', '安全整数上限から追加', 'test-after-safe-integer'
    );
    raise exception '満額Walletへの追加送金が成功しました';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message <> '送金後のWallet残高が安全な整数の上限を超えます' then
      raise exception '想定外の追加送金エラー: %', v_message;
    end if;
  end;

  select balance into v_wallet_balance from public.users where id = v_user_id;
  select balance into v_treasury_balance from public.guild_treasuries where family_id = v_family_id;
  select count(*) into v_transaction_count
  from public.economy_transactions where family_id = v_family_id;
  if v_wallet_balance <> 9007199254740991
    or v_treasury_balance <> 852516352
    or v_transaction_count <> 2 then
    raise exception '満額からの拒否後に金庫または台帳が変更されました';
  end if;
end;
$$;

-- 正式RPCと互換RPCが同じ冪等処理を共有し、二重発行しないことを確認する。
do $$
declare
  v_new_result jsonb;
  v_legacy_result jsonb;
  v_issue_count integer;
begin
  v_new_result := public.issue_treasury_gol(10, 'test-issue-gol');
  v_legacy_result := public.issue_treasury_hmc(10, 'test-issue-gol');

  select count(*) into v_issue_count
  from public.economy_transactions
  where idempotency_key = 'test-issue-gol';

  if v_new_result is distinct from v_legacy_result then
    raise exception '新旧追加発行RPCが同じ結果を返しませんでした';
  end if;
  if v_issue_count <> 1 then
    raise exception '互換RPC経由の再送で追加発行が%回記録されました', v_issue_count;
  end if;
end;
$$;

-- 更新権限を付けてトリガーそのものの拒否を確認する。CIのDB内だけの権限付与。
grant select on public.users to authenticated;
grant update (family_id) on public.users to authenticated;
set role authenticated;

do $$
declare
  v_message text;
begin
  begin
    update public.users
    set family_id = null
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    raise exception 'family_idの直接変更が成功しました';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'family_idは家族管理機能からのみ変更できます' then
      raise exception '想定外のfamily_id更新エラー: %', v_message;
    end if;
  end;
end;
$$;

reset role;
rollback;
