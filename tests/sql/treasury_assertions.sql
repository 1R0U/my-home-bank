-- 素のPostgreSQLでWalletのinteger上限とfamily_id保護を実行して確認する。
\set ON_ERROR_STOP on

begin;

insert into public.users (id, name, role, balance)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '金庫検証用の親', 'parent', 0);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

do $$
declare
  v_user_id constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_family_id uuid;
  v_wallet_balance integer;
  v_treasury_balance bigint;
  v_transaction_count integer;
  v_message text;
begin
  v_family_id := public.create_family_with_treasury('Wallet上限テスト', 3000000000, 'test-family-int4');

  begin
    perform private.transfer_treasury_wallet(
      v_family_id, v_user_id, v_user_id, 2147483648,
      'treasury_to_wallet', 'quest_reward', '上限超過', 'test-over-int4'
    );
    raise exception 'integer上限超過の送金が成功しました';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message <> '送金後のWallet残高がintegerの上限を超えます' then
      raise exception '想定外の送金エラー: %', v_message;
    end if;
  end;

  select balance into v_wallet_balance from public.users where id = v_user_id;
  select balance into v_treasury_balance from public.guild_treasuries where family_id = v_family_id;
  select count(*) into v_transaction_count
  from public.economy_transactions where family_id = v_family_id;
  if v_wallet_balance <> 0 or v_treasury_balance <> 3000000000 or v_transaction_count <> 1 then
    raise exception '拒否後にWallet・金庫・台帳が変更されました';
  end if;

  perform private.transfer_treasury_wallet(
    v_family_id, v_user_id, v_user_id, 2147483647,
    'treasury_to_wallet', 'quest_reward', '上限ちょうど', 'test-at-int4'
  );

  select balance into v_wallet_balance from public.users where id = v_user_id;
  if v_wallet_balance <> 2147483647 then
    raise exception 'integer上限ちょうどの送金が保存されませんでした';
  end if;

  begin
    perform private.transfer_treasury_wallet(
      v_family_id, v_user_id, v_user_id, 1,
      'treasury_to_wallet', 'quest_reward', '満額から追加', 'test-after-int4'
    );
    raise exception '満額Walletへの追加送金が成功しました';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message <> '送金後のWallet残高がintegerの上限を超えます' then
      raise exception '想定外の追加送金エラー: %', v_message;
    end if;
  end;

  select balance into v_treasury_balance from public.guild_treasuries where family_id = v_family_id;
  select count(*) into v_transaction_count
  from public.economy_transactions where family_id = v_family_id;
  if v_treasury_balance <> 852516353 or v_transaction_count <> 2 then
    raise exception '満額からの拒否後に金庫または台帳が変更されました';
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
