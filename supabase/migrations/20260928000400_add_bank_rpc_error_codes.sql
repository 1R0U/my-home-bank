-- Issue #189: 銀行RPCの業務エラーをSQLSTATEで判別できるようにする。
--
-- MHB01: 所持金不足
-- MHB02: 預金残高不足
-- MHB03: 返済額が借入残高を超過
-- MHB04: 金額が不正
-- MHB05: 利用者が存在しない
-- MHB06: 銀行口座が存在しない

create or replace function private.bank_deposit_unchecked(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = 'MHB04',
      message = '預入額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception using
      errcode = 'MHB04',
      message = '預入額は整数で指定してください';
  end if;

  select balance into v_balance
  from public.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB05',
      message = '利用者が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;
  if v_balance < p_amount then
    raise exception using
      errcode = 'MHB01',
      message = '所持金が不足しています',
      detail = format('所持金: %s, 預入額: %s', v_balance, p_amount);
  end if;

  -- ロック順序: users（上でロック済み）→ bank_accounts
  perform 1
  from public.bank_accounts
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB06',
      message = '銀行口座が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;

  update public.users
  set balance = balance - p_amount
  where id = p_user_id;

  update public.bank_accounts
  set deposit_balance = deposit_balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_deposit', '銀行への預入', -p_amount::integer);
end;
$$;

create or replace function private.bank_withdraw_unchecked(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deposit numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = 'MHB04',
      message = '引き出し額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception using
      errcode = 'MHB04',
      message = '引き出し額は整数で指定してください';
  end if;

  -- ロック順序: users → bank_accounts
  perform 1
  from public.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB05',
      message = '利用者が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;

  select deposit_balance into v_deposit
  from public.bank_accounts
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB06',
      message = '銀行口座が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;
  if v_deposit < p_amount then
    raise exception using
      errcode = 'MHB02',
      message = '預金残高が不足しています',
      detail = format('預金残高: %s, 引き出し額: %s', v_deposit, p_amount);
  end if;

  update public.users
  set balance = balance + p_amount
  where id = p_user_id;

  update public.bank_accounts
  set deposit_balance = deposit_balance - p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_withdraw', '銀行からの引き出し', p_amount::integer);
end;
$$;

create or replace function private.bank_borrow_unchecked(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = 'MHB04',
      message = '借入額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception using
      errcode = 'MHB04',
      message = '借入額は整数で指定してください';
  end if;

  -- ロック順序: users → bank_accounts
  perform 1
  from public.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB05',
      message = '利用者が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;

  update public.bank_accounts
  set loan_balance = loan_balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception using
      errcode = 'MHB06',
      message = '銀行口座が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;

  update public.users
  set balance = balance + p_amount
  where id = p_user_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_loan', '銀行からの借り入れ', p_amount::integer);
end;
$$;

create or replace function private.bank_repay_unchecked(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
  v_loan numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = 'MHB04',
      message = '返済額は0より大きい金額を指定してください';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception using
      errcode = 'MHB04',
      message = '返済額は整数で指定してください';
  end if;

  select balance into v_balance
  from public.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB05',
      message = '利用者が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;
  if v_balance < p_amount then
    raise exception using
      errcode = 'MHB01',
      message = '所持金が不足しています',
      detail = format('所持金: %s, 返済額: %s', v_balance, p_amount);
  end if;

  select loan_balance into v_loan
  from public.bank_accounts
  where user_id = p_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'MHB06',
      message = '銀行口座が存在しません',
      detail = format('利用者ID: %s', p_user_id);
  end if;
  if v_loan < p_amount then
    raise exception using
      errcode = 'MHB03',
      message = '返済額が借入残高を超えています',
      detail = format('借入残高: %s, 返済額: %s', v_loan, p_amount);
  end if;

  update public.users
  set balance = balance - p_amount
  where id = p_user_id;

  update public.bank_accounts
  set loan_balance = loan_balance - p_amount,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_repay', '銀行への返済', -p_amount::integer);
end;
$$;
