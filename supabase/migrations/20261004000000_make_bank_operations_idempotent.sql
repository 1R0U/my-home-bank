-- Issue #190: 手動預金の再送を、残高更新と同じトランザクションで識別する。
-- 記録は期限で削除しない。利用者の削除時だけ一緒に削除する。
create table public.bank_operations (
  operation_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdraw', 'borrow', 'repay')),
  amount numeric not null check (amount > 0 and amount <= 2147483647 and amount = trunc(amount)),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.bank_operations enable row level security;
revoke all on public.bank_operations from public, anon, authenticated;

create function private.run_bank_operation(
  p_user_id uuid, p_amount numeric, p_operation_id uuid, p_kind text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_operation public.bank_operations%rowtype;
  v_result jsonb;
begin
  -- 再送でも本人確認を先に行い、他人の保存結果を返さない。
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = '本人以外の口座は操作できません';
  end if;
  if p_operation_id is null then
    raise exception using errcode = 'MHB08', message = '操作IDを指定してください';
  end if;
  -- 既存の処理本体は取引額をintegerへ変換するため、その上限も先に検証する。
  if p_amount is null or p_amount <= 0 or p_amount > 2147483647
     or p_amount <> trunc(p_amount) then
    raise exception using errcode = 'MHB04', message = '金額は1〜2,147,483,647の整数で指定してください';
  end if;
  if p_kind is null or p_kind not in ('deposit', 'withdraw', 'borrow', 'repay') then
    raise exception using errcode = 'MHB08', message = '銀行操作の種類が不正です';
  end if;

  -- 同じ利用者の別IDも直列化する。既存のusers → bank_accounts順を維持する。
  perform 1 from public.users where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'MHB05', message = '利用者が存在しません';
  end if;

  -- 同じIDの並行送信は一意制約で待つ。記録も残高も途中失敗時に取り消される。
  insert into public.bank_operations(operation_id, user_id, kind, amount, result)
  values (p_operation_id, p_user_id, p_kind, p_amount, '{}'::jsonb)
  on conflict (operation_id) do nothing;
  if not found then
    select * into v_operation from public.bank_operations where operation_id = p_operation_id;
    if v_operation.user_id is distinct from p_user_id
       or v_operation.kind is distinct from p_kind
       or v_operation.amount is distinct from p_amount then
      raise exception using errcode = 'MHB07', message = '同じ操作IDで異なる操作はできません';
    end if;
    return v_operation.result;
  end if;

  case p_kind
    when 'deposit' then perform private.bank_deposit_unchecked(p_user_id, p_amount);
    when 'withdraw' then perform private.bank_withdraw_unchecked(p_user_id, p_amount);
    when 'borrow' then perform private.bank_borrow_unchecked(p_user_id, p_amount);
    when 'repay' then perform private.bank_repay_unchecked(p_user_id, p_amount);
  end case;
  select jsonb_build_object(
    'operation_id', p_operation_id, 'wallet_balance', u.balance,
    'deposit_balance', b.deposit_balance, 'loan_balance', b.loan_balance
  ) into v_result
  from public.users u join public.bank_accounts b on b.user_id = u.id
  where u.id = p_user_id;
  update public.bank_operations set result = v_result where operation_id = p_operation_id;
  return v_result;
end;
$$;
revoke all on function private.run_bank_operation(uuid, numeric, uuid, text) from public, anon, authenticated;

create function public.bank_deposit(p_user_id uuid, p_amount numeric, p_operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.run_bank_operation(p_user_id, p_amount, p_operation_id, 'deposit');
$$;
create function public.bank_withdraw(p_user_id uuid, p_amount numeric, p_operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.run_bank_operation(p_user_id, p_amount, p_operation_id, 'withdraw');
$$;
-- 旧借入・返済の権限は復活させない。通常のローンはrequest_loan / repay_loanを使う。
create function public.bank_borrow(p_user_id uuid, p_amount numeric, p_operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.run_bank_operation(p_user_id, p_amount, p_operation_id, 'borrow');
$$;
create function public.bank_repay(p_user_id uuid, p_amount numeric, p_operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.run_bank_operation(p_user_id, p_amount, p_operation_id, 'repay');
$$;
revoke all on function public.bank_deposit(uuid, numeric, uuid) from public, anon;
revoke all on function public.bank_withdraw(uuid, numeric, uuid) from public, anon;
revoke all on function public.bank_borrow(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.bank_repay(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.bank_deposit(uuid, numeric, uuid) to authenticated;
grant execute on function public.bank_withdraw(uuid, numeric, uuid) to authenticated;
-- IDなしの経路で重複防止を迂回できないようにする。旧版アプリは更新が必要。
revoke execute on function public.bank_deposit(uuid, numeric) from authenticated;
revoke execute on function public.bank_withdraw(uuid, numeric) from authenticated;
