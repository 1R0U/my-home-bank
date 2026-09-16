-- Issue #184: マイグレーション適用後のDBの動作を検証する ------------------------
--
-- supabase/migrations/*.sql をすべて適用した直後の空のDBに対して実行する。
-- 失敗した時点で exception を投げ、CIのジョブを落とす。
--
-- ここで確認するのは「マイグレーションどうしの整合」と「RPC・制約が実際に働くこと」。
-- 稼働中のSupabaseプロジェクトとの一致や、RLS・auth.uid() の挙動は対象外
-- （素のPostgreSQLには auth スキーマがないため）。

\set ON_ERROR_STOP on

-- 問い合わせの結果表（「(1 row)」など）は読む必要がないため捨てる。
-- \echo と raise notice は別の出力先のため、検証結果は引き続き表示される。
\o /dev/null

-- 検証用のヘルパー。pg_temp に作るため、このセッション内だけで有効。
create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

-- 実行すると失敗するはずのSQLを検証する。成功してしまった場合に exception を投げる。
create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    -- 例外が起きた時点でこのブロック内の変更は取り消されるため、後続の検証に影響しない。
    raise notice 'OK  %（拒否された: %）', p_label, replace(sqlerrm, E'\n', ' ');
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

\echo '=== 1. テーブルが揃っているか ==='

do $$
declare
  v_expected constant text[] := array[
    'bank_accounts', 'quest_logs', 'quests', 'store_item_requests',
    'task_reports', 'transactions', 'users'
  ];
  v_actual text[];
begin
  select array_agg(tablename order by tablename)
  into v_actual
  from pg_tables
  where schemaname = 'public';

  perform pg_temp.assert(
    v_actual @> v_expected,
    format('7テーブルが作られている（実際: %s）', array_to_string(v_actual, ', '))
  );
end;
$$;

\echo '=== 2. 利用者の追加で銀行口座が自動作成されるか ==='

insert into users (id, name, role, balance) values
  ('11111111-1111-1111-1111-111111111111', '親', 'parent', 0),
  ('22222222-2222-2222-2222-222222222222', '子', 'child', 100);

do $$
declare
  v_count integer;
begin
  -- 検証用に入れた2人だけを数える。テーブル全体を数えると、
  -- マイグレーションが seed する開発用ゲストユーザーの口座まで入ってしまう（Issue #211）。
  select count(*) into v_count
  from bank_accounts
  where user_id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );
  perform pg_temp.assert(v_count = 2, '利用者2人にそれぞれ口座が作られる');

  select count(*) into v_count
  from bank_accounts
  where user_id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  )
    and deposit_balance = 0 and loan_balance = 0
    and interest_rate = 0.05 and loan_rate = 0.10;
  perform pg_temp.assert(v_count = 2, '口座の初期値が残高0・利率が既定値になる');
end;
$$;

\echo '=== 3. クエストの承認フロー ==='

insert into quests (id, title, description, reward_amount, status, created_by, category, assigned_to)
values ('33333333-3333-3333-3333-333333333333', 'お風呂掃除', '浴槽を洗う', 50, 'accepted',
        '11111111-1111-1111-1111-111111111111', 'daily', '22222222-2222-2222-2222-222222222222');

select submit_quest_completion(
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222');

do $$
declare
  v_status text;
  v_count integer;
begin
  select status into v_status from quests where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.assert(v_status = 'pending', '完了申請でクエストが pending になる');

  select count(*) into v_count
  from quest_logs
  where quest_id = '33333333-3333-3333-3333-333333333333' and status = 'pending';
  perform pg_temp.assert(v_count = 1, '完了申請が1件だけ作られる');
end;
$$;

select approve_quest_log(
  (select id from quest_logs where quest_id = '33333333-3333-3333-3333-333333333333'),
  '11111111-1111-1111-1111-111111111111');

do $$
declare
  v_balance numeric;
  v_status text;
  v_amount integer;
  v_count integer;
begin
  select balance into v_balance from users where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.assert(v_balance = 150, '承認で報酬50が加算され、残高が100から150になる');

  select status into v_status from quests where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.assert(v_status = 'completed', '承認でクエストが completed になる');

  select count(*), max(amount) into v_count, v_amount
  from transactions
  where user_id = '22222222-2222-2222-2222-222222222222' and type = 'quest_reward';
  perform pg_temp.assert(v_count = 1 and v_amount = 50, '台帳に quest_reward が50で1件だけ記帳される');
end;
$$;

\echo '=== 4. 同じ完了申請を二度承認しても報酬が重複しないか ==='

-- approve_quest_log は status = 'pending' の行だけを対象にするため、
-- 2回目は例外になる。残高が二重に増えないことを確認する。
select pg_temp.assert_rejected(
  format('select approve_quest_log(%L, %L)',
         (select id from quest_logs where quest_id = '33333333-3333-3333-3333-333333333333'),
         '11111111-1111-1111-1111-111111111111'),
  '承認済みの申請は再承認できない');

do $$
declare
  v_balance numeric;
begin
  select balance into v_balance from users where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.assert(v_balance = 150, '再承認を試みても残高は150のまま');
end;
$$;

-- 上の検証は approve_quest_log の status ガードが働くことを確かめている。
-- 最後の砦である部分一意インデックス（transactions_quest_log_id_unique）自体も、
-- 同じ申請から台帳エントリを2件作れないことで直接確かめる。
select pg_temp.assert_rejected(
  format(
    $q$insert into transactions (user_id, type, description, amount, quest_log_id)
       values (%L, 'quest_reward', '二重記帳', 50, %L)$q$,
    '22222222-2222-2222-2222-222222222222',
    (select id from quest_logs where quest_id = '33333333-3333-3333-3333-333333333333')),
  '同じ完了申請から台帳エントリを2件作れない');

-- 一方で、申請IDがNULLの行は複数作れる（部分一意インデックスの対象外）。
-- 銀行の取引が記帳できなくならないことを確認する。
do $$
declare
  v_count integer;
begin
  insert into transactions (user_id, type, description, amount)
  values ('22222222-2222-2222-2222-222222222222', 'bank_interest', '検証用', 1),
         ('22222222-2222-2222-2222-222222222222', 'bank_interest', '検証用', 1);

  select count(*) into v_count
  from transactions
  where description = '検証用';
  perform pg_temp.assert(v_count = 2, '申請IDがNULLの取引は複数記帳できる');

  -- 以降の件数の検証に影響しないよう取り除く。
  delete from transactions where description = '検証用';
end;
$$;

\echo '=== 5. 銀行の4操作 ==='

select bank_deposit('22222222-2222-2222-2222-222222222222', 30);
select bank_withdraw('22222222-2222-2222-2222-222222222222', 10);
select bank_borrow('22222222-2222-2222-2222-222222222222', 100);
select bank_repay('22222222-2222-2222-2222-222222222222', 40);

do $$
declare
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
begin
  select u.balance, ba.deposit_balance, ba.loan_balance
  into v_wallet, v_deposit, v_loan
  from users u join bank_accounts ba on ba.user_id = u.id
  where u.id = '22222222-2222-2222-2222-222222222222';

  -- 150 + 30(預入で減) ... 財布: 150 - 30 + 10 + 100 - 40 = 190
  perform pg_temp.assert(v_wallet = 190, format('財布が190になる（実際: %s）', v_wallet));
  perform pg_temp.assert(v_deposit = 20, format('預金が20になる（実際: %s）', v_deposit));
  perform pg_temp.assert(v_loan = 60, format('借金が60になる（実際: %s）', v_loan));
end;
$$;

do $$
declare
  v_actual text;
begin
  -- 台帳の金額は「財布の増減方向」で記帳される（Issue #143）。
  select string_agg(type || ':' || amount, ', ' order by created_at, type)
  into v_actual
  from transactions
  where user_id = '22222222-2222-2222-2222-222222222222'
    and type like 'bank_%';

  perform pg_temp.assert(
    v_actual = 'bank_deposit:-30, bank_withdraw:10, bank_loan:100, bank_repay:-40',
    format('台帳に4操作が財布の増減方向で記帳される（実際: %s）', v_actual)
  );
end;
$$;

\echo '=== 6. 拒否されるべき操作 ==='

select pg_temp.assert_rejected(
  $q$select bank_deposit('22222222-2222-2222-2222-222222222222', 9999)$q$,
  '所持金を超える預入');

select pg_temp.assert_rejected(
  $q$select bank_deposit('22222222-2222-2222-2222-222222222222', 1.5)$q$,
  '小数の預入');

select pg_temp.assert_rejected(
  $q$select bank_deposit('22222222-2222-2222-2222-222222222222', 0)$q$,
  '0の預入');

select pg_temp.assert_rejected(
  $q$select bank_deposit('22222222-2222-2222-2222-222222222222', -10)$q$,
  '負の額の預入');

select pg_temp.assert_rejected(
  $q$select bank_repay('22222222-2222-2222-2222-222222222222', 9999)$q$,
  '借入残高を超える返済');

select pg_temp.assert_rejected(
  $q$select bank_withdraw('22222222-2222-2222-2222-222222222222', 9999)$q$,
  '預金残高を超える引き出し');

select pg_temp.assert_rejected(
  $q$update bank_accounts set deposit_balance = -1
     where user_id = '22222222-2222-2222-2222-222222222222'$q$,
  '預金残高を負にする直接更新');

select pg_temp.assert_rejected(
  $q$insert into users (name, role) values ('x', 'teacher')$q$,
  '定義されていない role の利用者');

select pg_temp.assert_rejected(
  $q$insert into bank_accounts (user_id) values ('22222222-2222-2222-2222-222222222222')$q$,
  '同じ利用者への口座の重複作成');

select pg_temp.assert_rejected(
  $q$insert into transactions (user_id, type, description, amount)
     values ('22222222-2222-2222-2222-222222222222', 'mining', 'x', 1)$q$,
  '定義されていない取引種別');

select pg_temp.assert_rejected(
  $q$select submit_quest_completion('33333333-3333-3333-3333-333333333333',
                                    '11111111-1111-1111-1111-111111111111')$q$,
  '受注していない利用者からの完了申請');

\echo '=== 7. 拒否された後もデータが変わっていないか ==='

do $$
declare
  v_wallet numeric;
  v_deposit numeric;
  v_loan numeric;
  v_tx_count integer;
begin
  select u.balance, ba.deposit_balance, ba.loan_balance
  into v_wallet, v_deposit, v_loan
  from users u join bank_accounts ba on ba.user_id = u.id
  where u.id = '22222222-2222-2222-2222-222222222222';

  select count(*) into v_tx_count
  from transactions where user_id = '22222222-2222-2222-2222-222222222222';

  perform pg_temp.assert(
    v_wallet = 190 and v_deposit = 20 and v_loan = 60 and v_tx_count = 5,
    '拒否された操作で残高も台帳も変わっていない'
  );
end;
$$;

\echo '=== すべての検証を通過しました ==='
