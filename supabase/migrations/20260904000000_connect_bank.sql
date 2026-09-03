-- Issue #65: 所持金・銀行機能をSupabaseに繋ぐ ------------------------------------
--
-- 預入・引き出し・借り入れ・返済の4操作を、DB側の関数で1トランザクションとして実行する。
-- 預入/引き出しは「お財布(users.balance)」と「銀行預金(bank_accounts.deposit_balance)」
-- 間の振替であり、家庭内通貨の総量が変わらないため transactions には記録しない。
-- 借り入れは新たに使えるお金が生まれる（負債と引き換えに）ため 'bank_loan' として記帳する。
-- 返済は負債の解消（お金が消える）であり、記帳の対象外とする。

-- 1. 預入: お財布の残高を減らし、銀行預金を増やす
create or replace function bank_deposit(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '預入額は0より大きい金額を指定してください';
  end if;

  select balance into v_balance from users where id = p_user_id for update;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;
  if v_balance < p_amount then
    raise exception '所持金が不足しています（所持金: %, 預入額: %）', v_balance, p_amount;
  end if;

  update users set balance = balance - p_amount where id = p_user_id;

  update bank_accounts
    set deposit_balance = deposit_balance + p_amount, updated_at = now()
    where user_id = p_user_id;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;
end;
$$;

-- 2. 引き出し: 銀行預金を減らし、お財布の残高を増やす
create or replace function bank_withdraw(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '引き出し額は0より大きい金額を指定してください';
  end if;

  select deposit_balance into v_deposit from bank_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;
  if v_deposit < p_amount then
    raise exception '預金残高が不足しています（預金残高: %, 引き出し額: %）', v_deposit, p_amount;
  end if;

  update bank_accounts
    set deposit_balance = deposit_balance - p_amount, updated_at = now()
    where user_id = p_user_id;

  update users set balance = balance + p_amount where id = p_user_id;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;
end;
$$;

-- 3. 借り入れ: 借入残高を増やし、お財布の残高を増やす。transactionsにbank_loanとして記帳する
create or replace function bank_borrow(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '借入額は0より大きい金額を指定してください';
  end if;

  update bank_accounts
    set loan_balance = loan_balance + p_amount, updated_at = now()
    where user_id = p_user_id;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;

  update users set balance = balance + p_amount where id = p_user_id;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;

  insert into transactions (user_id, type, description, amount)
  values (p_user_id, 'bank_loan', '銀行からの借り入れ', p_amount::integer);
end;
$$;

-- 4. 返済: お財布の残高を減らし、借入残高を減らす（借入残高を超える返済は拒否する）
create or replace function bank_repay(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_loan numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '返済額は0より大きい金額を指定してください';
  end if;

  select balance into v_balance from users where id = p_user_id for update;
  if not found then
    raise exception 'user not found: %', p_user_id;
  end if;
  if v_balance < p_amount then
    raise exception '所持金が不足しています（所持金: %, 返済額: %）', v_balance, p_amount;
  end if;

  select loan_balance into v_loan from bank_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'bank account not found for user: %', p_user_id;
  end if;
  if v_loan < p_amount then
    raise exception '返済額が借入残高を超えています（借入残高: %, 返済額: %）', v_loan, p_amount;
  end if;

  update users set balance = balance - p_amount where id = p_user_id;
  update bank_accounts
    set loan_balance = loan_balance - p_amount, updated_at = now()
    where user_id = p_user_id;
end;
$$;

-- 注意（既知の制約・Phase 2で対応予定、Issue #63/#64/#75と同様）:
-- 上記4関数はすべてsecurity definerで実行されるが、auth.uid()とp_user_idの
-- 突き合わせは行っていない。Supabase Auth未連携のため今回は対応不可。
