-- assertions.sqlのヘルパーを使い、テストデータは全て取り消す。
begin;
select set_config('request.jwt.claim.sub', '', true);
insert into public.families(id, name) values ('19000000-0000-4000-8000-000000000010', '銀行操作検証');
insert into public.users(id, family_id, name, role, balance) values
  ('19000000-0000-4000-8000-000000000011', '19000000-0000-4000-8000-000000000010', '本人', 'child', 100),
  ('19000000-0000-4000-8000-000000000012', '19000000-0000-4000-8000-000000000010', '別利用者', 'child', 100);
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000011', true);

do $$
declare
  v_kind text;
  v_first jsonb;
  v_second jsonb;
  v_id uuid;
  v_next_id uuid;
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
begin
  foreach v_kind in array array['deposit', 'withdraw', 'borrow', 'repay'] loop
    delete from public.bank_operations where user_id = auth.uid();
    delete from public.transactions where user_id = auth.uid();
    update public.users set balance = 100 where id = auth.uid();
    update public.bank_accounts set deposit_balance = 100, loan_balance = 100 where user_id = auth.uid();
    v_id := gen_random_uuid();
    v_next_id := gen_random_uuid();
    execute format('select public.bank_%s($1, $2, $3)', v_kind) into v_first using auth.uid(), 30, v_id;
    execute format('select public.bank_%s($1, $2, $3)', v_kind) into v_second using auth.uid(), 30, v_id;
    perform pg_temp.assert(v_first = v_second, v_kind || ': 再送は保存済みの結果を返す');
    perform pg_temp.assert((select count(*) = 1 from public.transactions where user_id = auth.uid()), v_kind || ': 再送は一度だけ記帳する');
    perform pg_temp.assert((select count(*) = 1 from public.bank_operations where user_id = auth.uid()), v_kind || ': 再送は一度だけ操作記録を作る');
    perform pg_temp.assert_sqlstate(format('select public.bank_%s(%L, 31, %L)', v_kind, auth.uid(), v_id), 'MHB07', v_kind || ': 同じIDで金額変更を拒否する');
    execute format('select public.bank_%s($1, $2, $3)', v_kind) using auth.uid(), 30, v_next_id;
    select u.balance, b.deposit_balance, b.loan_balance into v_wallet, v_deposit, v_loan
      from public.users u join public.bank_accounts b on b.user_id = u.id where u.id = auth.uid();
    perform pg_temp.assert(v_wallet = case when v_kind in ('deposit', 'repay') then 40 else 160 end, v_kind || ': 別IDは財布へ2回分反映する');
    perform pg_temp.assert(v_deposit = case v_kind when 'deposit' then 160 when 'withdraw' then 40 else 100 end, v_kind || ': 預金への反映額が正しい');
    perform pg_temp.assert(v_loan = case v_kind when 'borrow' then 160 when 'repay' then 40 else 100 end, v_kind || ': 借入への反映額が正しい');
    perform pg_temp.assert((select count(*) = 2 from public.transactions where user_id = auth.uid()), v_kind || ': 別IDは2回記帳する');
    execute format('select public.bank_%s($1, $2, $3)', v_kind) into v_second using auth.uid(), 30, v_id;
    perform pg_temp.assert(v_first = v_second, v_kind || ': 後の取引後も元の結果を返す');
    perform pg_temp.assert_sqlstate(format('select public.bank_%s(%L, 30, null)', v_kind, auth.uid()), 'MHB08', v_kind || ': IDなしを拒否する');
    perform pg_temp.assert_sqlstate(format('select public.bank_%s(%L, ''NaN'', %L)', v_kind, auth.uid(), gen_random_uuid()), 'MHB04', v_kind || ': NaNを拒否する');
  end loop;
end;
$$;

select pg_temp.assert_sqlstate(
  format('select public.bank_deposit(%L, 30, %L)', auth.uid(),
    (select operation_id from public.bank_operations where user_id = auth.uid() limit 1)),
  'MHB07', '同じIDで操作の種類を変えられない');
select pg_temp.assert_sqlstate(
  $q$select public.bank_deposit('19000000-0000-4000-8000-000000000012', 30, gen_random_uuid())$q$,
  '42501', '他人の口座を操作できない');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000012', true);
select pg_temp.assert_sqlstate(
  format('select public.bank_repay(%L, 30, %L)', auth.uid(),
    (select operation_id from public.bank_operations where user_id = '19000000-0000-4000-8000-000000000011' limit 1)),
  'MHB07', '他人のIDの結果を返さない');

-- ロールの権限: 操作記録へ直接アクセスできず、IDなし・旧ローンの経路も使えない。
select pg_temp.assert(not has_table_privilege('authenticated', 'public.bank_operations', 'SELECT,INSERT,UPDATE,DELETE'), '操作記録はRPCだけが扱う');
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.bank_deposit(uuid,numeric)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bank_withdraw(uuid,numeric)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bank_borrow(uuid,numeric,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bank_repay(uuid,numeric,uuid)', 'EXECUTE'),
  'IDなし経路と旧借入・返済を公開しない');
select pg_temp.assert(not has_function_privilege('anon', 'public.bank_deposit(uuid,numeric,uuid)', 'EXECUTE'), '未ログインでは預入できない');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_sqlstate(
  $q$select public.bank_deposit('19000000-0000-4000-8000-000000000011', 1, gen_random_uuid())$q$,
  '42501', '所有者接続でも本人の指定なしでは再送結果を返さない');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000012', true);
set local role authenticated;
select public.bank_deposit('19000000-0000-4000-8000-000000000012', 10, '19000000-0000-4000-8000-000000000020');
reset role;
update public.bank_accounts set loan_balance = 100 where user_id = auth.uid();

-- 残高更新後の台帳挿入で例外を発生させ、操作記録と流通履歴も戻ることを確認する。
create function pg_temp.fail_bank_transaction() returns trigger language plpgsql as $$
begin
  if new.user_id = '19000000-0000-4000-8000-000000000012'::uuid then
    raise exception '台帳の途中失敗を再現';
  end if;
  return new;
end;
$$;
create trigger fail_bank_transaction before insert on public.transactions
for each row execute function pg_temp.fail_bank_transaction();
do $$
declare
  v_kind text;
  v_history_count bigint;
  v_operation_count bigint;
  v_transaction_count bigint;
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
begin
  select count(*) into v_history_count from public.wallet_circulation_changes;
  select count(*) into v_operation_count from public.bank_operations;
  select count(*) into v_transaction_count from public.transactions;
  select u.balance, b.deposit_balance, b.loan_balance into v_wallet, v_deposit, v_loan
    from public.users u join public.bank_accounts b on b.user_id = u.id where u.id = auth.uid();
  foreach v_kind in array array['deposit', 'withdraw', 'borrow', 'repay'] loop
    perform pg_temp.assert_sqlstate(format('select public.bank_%s(%L, 1, %L)', v_kind, auth.uid(), gen_random_uuid()), 'P0001', v_kind || ': 台帳途中失敗');
    perform pg_temp.assert((select balance = v_wallet from public.users where id = auth.uid()), v_kind || ': 財布も戻る');
    perform pg_temp.assert((select deposit_balance = v_deposit and loan_balance = v_loan from public.bank_accounts where user_id = auth.uid()), v_kind || ': 口座も戻る');
    perform pg_temp.assert((select count(*) = v_history_count from public.wallet_circulation_changes), v_kind || ': 流通履歴も戻る');
    perform pg_temp.assert((select count(*) = v_operation_count from public.bank_operations), v_kind || ': 操作記録も戻る');
    perform pg_temp.assert((select count(*) = v_transaction_count from public.transactions), v_kind || ': 台帳も戻る');
  end loop;
end;
$$;
drop trigger fail_bank_transaction on public.transactions;
-- 失敗したIDは確定していないので、同じIDで再試行できる。
select pg_temp.assert_sqlstate(
  $q$select public.bank_deposit('19000000-0000-4000-8000-000000000012', 100, '19000000-0000-4000-8000-000000000021')$q$,
  'MHB01', '残高不足でも操作記録を残さない');
update public.users set balance = 100 where id = auth.uid();
select public.bank_deposit(auth.uid(), 100, '19000000-0000-4000-8000-000000000021');
select public.bank_deposit(auth.uid(), 100, '19000000-0000-4000-8000-000000000021');
select pg_temp.assert((select balance = 0 from public.users where id = auth.uid()), '残高が不足していても確定済みの再送は成功する');
rollback;
\echo === Issue #190 銀行操作の再送と途中失敗を確認しました ===
