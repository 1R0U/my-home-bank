-- Issue #184: 追いつき用マイグレーションを再適用した後、既存データが残っているか検証する。
--
-- tests/sql/assertions.sql を実行した直後のDBに対して実行する。
-- create table if not exists は既存テーブルを素通りするため、再適用で
-- データが消えることは本来ないが、それを確かめずに済ませない。
--
-- 件数や残高は、assertions.sql が入れた検証用の2人だけを対象に数える。
-- テーブル全体を数えると、マイグレーションが seed する開発用ゲストユーザーまで
-- 含まれてしまう（Issue #211）。

\set ON_ERROR_STOP on

do $$
declare
  -- assertions.sql が入れる検証用の利用者。
  c_parent_id constant uuid := '11111111-1111-1111-1111-111111111111';
  c_child_id constant uuid := '22222222-2222-2222-2222-222222222222';
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
  v_tx_count integer;
  v_user_count integer;
begin
  -- 子の残高は id で引く。role で引くと、ゲストの子と2行になって
  -- どちらが取れるか決まらない。
  select u.balance, ba.deposit_balance, ba.loan_balance
  into v_wallet, v_deposit, v_loan
  from users u join bank_accounts ba on ba.user_id = u.id
  where u.id = c_child_id;

  select count(*) into v_tx_count
  from transactions
  where user_id in (c_parent_id, c_child_id);

  select count(*) into v_user_count
  from users
  where id in (c_parent_id, c_child_id);

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
