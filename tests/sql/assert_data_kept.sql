-- Issue #184: 追いつき用マイグレーションを再適用した後、既存データが残っているか検証する。
--
-- tests/sql/assertions.sql を実行した直後のDBに対して実行する。
-- create table if not exists は既存テーブルを素通りするため、再適用で
-- データが消えることは本来ないが、それを確かめずに済ませない。

\set ON_ERROR_STOP on

do $$
declare
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
  v_tx_count integer;
  v_user_count integer;
begin
  select u.balance, ba.deposit_balance, ba.loan_balance
  into v_wallet, v_deposit, v_loan
  from users u join bank_accounts ba on ba.user_id = u.id
  where u.role = 'child';

  select count(*) into v_tx_count from transactions;
  select count(*) into v_user_count from users;

  if v_user_count <> 2 then
    raise exception '再適用で利用者が変わった（期待: 2, 実際: %）', v_user_count;
  end if;

  if v_wallet <> 190 or v_deposit <> 20 or v_loan <> 60 then
    raise exception
      '再適用で残高が変わった（期待: 財布190/預金20/借金60, 実際: 財布%/預金%/借金%）',
      v_wallet, v_deposit, v_loan;
  end if;

  if v_tx_count <> 5 then
    raise exception '再適用で台帳の件数が変わった（期待: 5, 実際: %）', v_tx_count;
  end if;

  raise notice 'OK  再適用しても利用者・残高・台帳が保持される（財布%/預金%/借金%, 台帳%件）',
    v_wallet, v_deposit, v_loan, v_tx_count;
end;
$$;
