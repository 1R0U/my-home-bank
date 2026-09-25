-- Issue #184: マイグレーション適用後のDBの動作を検証する ------------------------
--
-- supabase/migrations/*.sql をすべて適用した直後の空のDBに対して実行する。
-- 失敗した時点で exception を投げ、CIのジョブを落とす。
--
-- ここで確認するのは「マイグレーションどうしの整合」と「RPC・制約が実際に働くこと」。
-- 稼働中のSupabaseプロジェクトとの一致や、実際のJWT検証は対象外。
-- auth.uid() は tests/sql/setup_supabase_auth.sql の最小実装でRPCの本人確認を検証する。

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
    'bank_accounts', 'equipped_items', 'owned_items', 'placed_decorations',
    'quest_logs', 'quests', 'store_item_requests', 'store_items', 'task_reports',
    'transactions', 'users'
  ];
  v_actual text[];
begin
  select array_agg(tablename order by tablename)
  into v_actual
  from pg_tables
  where schemaname = 'public';

  perform pg_temp.assert(
    v_actual @> v_expected,
    format('8テーブルが作られている（実際: %s）', array_to_string(v_actual, ', '))
  );
end;
$$;

\echo '=== 2. 利用者の追加で銀行口座が自動作成されるか ==='

insert into users (id, name, role, balance, family_id) values
  ('11111111-1111-1111-1111-111111111111', '親', 'parent', 0,
   '00000000-0000-4000-8000-000000000208'),
  ('22222222-2222-2222-2222-222222222222', '子', 'child', 100,
   '00000000-0000-4000-8000-000000000208');

insert into families (id, name)
values ('12121212-1212-4212-8212-121212121212', '検証用家族');

update users
set family_id = '12121212-1212-4212-8212-121212121212'
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

insert into guild_treasuries (family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values ('12121212-1212-4212-8212-121212121212', 1000, 1000, 1100, 0);

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
    and interest_rate = 0.05 and loan_rate = 0.05
    and loan_limit = 0 and loan_term_days = 30;
  perform pg_temp.assert(v_count = 2, '口座の初期値が残高0・利率が既定値になる');
end;
$$;

\echo '=== 2b. Auth登録で利用者プロフィールが自動作成されるか ==='

insert into auth.users (id, raw_user_meta_data)
values (
  '88888888-8888-4888-8888-888888888888',
  '{"name":"  Auth利用者  ","role":"parent"}'::jsonb
);

do $$
declare
  v_name text;
  v_role text;
  v_balance numeric;
  v_account_count integer;
begin
  select name, role, balance
  into v_name, v_role, v_balance
  from public.users
  where id = '88888888-8888-4888-8888-888888888888';

  select count(*)
  into v_account_count
  from public.bank_accounts
  where user_id = '88888888-8888-4888-8888-888888888888';

  perform pg_temp.assert(
    v_name = 'Auth利用者' and v_role = 'parent' and v_balance = 0,
    'Auth登録と同じID・名前・役割でusersプロフィールが作られる'
  );
  perform pg_temp.assert(v_account_count = 1, 'Auth登録した利用者の銀行口座も作られる');
end;
$$;

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, raw_user_meta_data)
     values (
       '99999999-9999-4999-8999-999999999999',
       '{"name":"不正な役割","role":"admin"}'::jsonb
     )$q$,
  '不正な役割でのAuth登録'
);

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, raw_user_meta_data)
     values (
       '99999999-9999-4999-8999-999999999998',
       '{"name":"公開登録の子供","role":"child"}'::jsonb
     )$q$,
  '公開登録でのchild役割指定'
);

\echo '=== 2c. Google OAuth登録で親プロフィールと家庭を一度だけ作れるか ==='

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
values (
  '99999999-9999-4999-8999-999999999996',
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"  Google 利用者  "}'::jsonb
);

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
values (
  '99999999-9999-4999-8999-999999999993',
  '{"provider":"google","providers":["google"]}'::jsonb,
  jsonb_build_object('name', repeat('長', 51))
);

do $$
declare
  v_name text;
  v_role text;
  v_balance numeric;
  v_account_count integer;
  v_first_family_id uuid;
  v_second_family_id uuid;
begin
  select name, role, balance
  into v_name, v_role, v_balance
  from public.users
  where id = '99999999-9999-4999-8999-999999999996';

  select count(*)
  into v_account_count
  from public.bank_accounts
  where user_id = '99999999-9999-4999-8999-999999999996';

  perform pg_temp.assert(
    v_name = 'Google 利用者' and v_role = 'parent' and v_balance = 0,
    'Googleの表示名とDB固定のparent役割でusersプロフィールが作られる'
  );
  perform pg_temp.assert(v_account_count = 1, 'Google認証利用者の銀行口座も作られる');
  perform pg_temp.assert(
    (select char_length(name) = 50 and role = 'parent'
     from public.users
     where id = '99999999-9999-4999-8999-999999999993'),
    '50文字を超えるGoogle表示名は50文字へ切り詰めて登録される'
  );

  perform set_config(
    'request.jwt.claim.sub',
    '99999999-9999-4999-8999-999999999996',
    false
  );
  v_first_family_id := public.create_family_with_treasury(
    'Google 利用者の家族', 10000, 'auth-registration:99999999-9999-4999-8999-999999999996'
  );
  v_second_family_id := public.create_family_with_treasury(
    'Google 利用者の家族', 10000, 'auth-registration:99999999-9999-4999-8999-999999999996'
  );

  perform pg_temp.assert(v_first_family_id = v_second_family_id, '家庭作成の再送は同じ家庭を返す');
  perform pg_temp.assert(
    (select family_id = v_first_family_id from public.users
     where id = '99999999-9999-4999-8999-999999999996'),
    'Google認証利用者が作成した家庭へ所属する'
  );
  perform pg_temp.assert(
    (select count(*) from public.guild_treasuries where family_id = v_first_family_id) = 1,
    'Google認証利用者のギルド金庫が一度だけ作られる'
  );
  perform pg_temp.assert(
    (select count(*) from public.economy_transactions
     where idempotency_key = 'auth-registration:99999999-9999-4999-8999-999999999996') = 1,
    'Google認証利用者の初期通貨が一度だけ発行される'
  );

  perform set_config('request.jwt.claim.sub', '', false);
end;
$$;

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
     values (
       '99999999-9999-4999-8999-999999999995',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"name":"Googleを名乗る利用者","provider":"google"}'::jsonb
     )$q$,
  '利用者が変更できるmetadataだけでのGoogle偽装'
);

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
     values (
       '99999999-9999-4999-8999-999999999994',
       '{"provider":"google","providers":["google"]}'::jsonb,
       '{}'::jsonb
     )$q$,
  '表示名がないGoogle認証登録'
);

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
     values (
       '99999999-9999-4999-8999-999999999992',
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('name', repeat('長', 51), 'role', 'parent')
     )$q$,
  '50文字を超えるメール登録名'
);

select pg_temp.assert(
  not exists (
    select 1 from auth.users
    where id in (
      '99999999-9999-4999-8999-999999999995',
      '99999999-9999-4999-8999-999999999994',
      '99999999-9999-4999-8999-999999999992'
    )
  ),
  'プロフィール作成に失敗したAuth利用者は同じトランザクションで残らない'
);

\echo '=== 2d. usersのRLSと列権限が本人の安全な設定更新だけを許可するか ==='

insert into public.families (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RLS検証家族'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '別のRLS検証家族');

update public.users
set family_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
where id = '88888888-8888-4888-8888-888888888888';

insert into public.users (id, name, role, balance, family_id) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '同じ家族の利用者', 'child', 0,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', '別の家族の利用者', 'child', 0,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);

select pg_temp.assert(
  (select count(*) from public.users) = 2,
  '認証済み利用者には本人と同じ家族のusers行が見える'
);

select pg_temp.assert(
  exists (
    select 1 from public.users
    where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  ),
  '同じ家族の別利用者が見える'
);

select pg_temp.assert(
  not exists (
    select 1 from public.users
    where id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
  ),
  '別の家族の利用者は見えない'
);

update public.users
set name = '更新後のAuth利用者', notifications_enabled = false
where id = '88888888-8888-4888-8888-888888888888';

select pg_temp.assert(
  (select name = '更新後のAuth利用者' and notifications_enabled = false
   from public.users
   where id = '88888888-8888-4888-8888-888888888888'),
  '本人は名前と通知設定を更新できる'
);

-- Issue #277: 生年月日と性別
update public.users
set birth_date = '2015-04-12', gender = 'female'
where id = '88888888-8888-4888-8888-888888888888';

select pg_temp.assert(
  (select birth_date = date '2015-04-12' and gender = 'female'
   from public.users
   where id = '88888888-8888-4888-8888-888888888888'),
  '本人は生年月日と性別を更新できる'
);

update public.users
set birth_date = null, gender = null
where id = '88888888-8888-4888-8888-888888888888';

select pg_temp.assert(
  (select birth_date is null and gender is null
   from public.users
   where id = '88888888-8888-4888-8888-888888888888'),
  '生年月日と性別は未設定（null）に戻せる'
);

select pg_temp.assert_rejected(
  $q$update public.users set gender = 'unknown'
     where id = '88888888-8888-4888-8888-888888888888'$q$,
  '決めた値以外の性別'
);

select pg_temp.assert_rejected(
  $q$update public.users set birth_date = '1899-12-31'
     where id = '88888888-8888-4888-8888-888888888888'$q$,
  '1900年より前の生年月日'
);

update public.users
set birth_date = '2000-01-01', gender = 'male'
where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

reset role;
select pg_temp.assert(
  (select birth_date is null and gender is null
   from public.users
   where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
  '同じ家族でも、他人の生年月日と性別は更新できない'
);
set role authenticated;

select pg_temp.assert_rejected(
  $q$update public.users set balance = 999
     where id = '88888888-8888-4888-8888-888888888888'$q$,
  '認証済み利用者によるbalanceの直接更新'
);

select pg_temp.assert_rejected(
  $q$insert into public.users (id, name, role)
     values ('99999999-9999-4999-8999-999999999997', '直接作成', 'parent')$q$,
  '認証済み利用者によるusersの直接作成'
);

reset role;
reset request.jwt.claim.sub;

delete from public.bank_accounts
where user_id in (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
);
delete from public.users
where id in (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
);
update public.users
set family_id = null
where id = '88888888-8888-4888-8888-888888888888';
delete from public.families
where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

set role anon;
select pg_temp.assert_rejected(
  $q$select * from public.users$q$,
  '未認証利用者によるusersの参照'
);
reset role;

\echo '=== 3. クエストの承認フロー ==='

insert into quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to)
values ('33333333-3333-3333-3333-333333333333',
        '12121212-1212-4212-8212-121212121212', 'お風呂掃除', '浴槽を洗う', 50, 'accepted',
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

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);

select approve_quest_log(
  (select id from quest_logs where quest_id = '33333333-3333-3333-3333-333333333333'),
  '11111111-1111-1111-1111-111111111111');

do $$
declare
  v_balance numeric;
  v_treasury_balance bigint;
  v_status text;
  v_amount bigint;
  v_count integer;
begin
  select balance into v_balance from users where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.assert(v_balance = 150, '承認で報酬50が加算され、残高が100から150になる');

  select balance into v_treasury_balance
  from guild_treasuries
  where family_id = '12121212-1212-4212-8212-121212121212';
  perform pg_temp.assert(v_treasury_balance = 950, '承認でギルド金庫から報酬50が支払われる');

  select status into v_status from quests where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.assert(v_status = 'completed', '承認でクエストが completed になる');

  select count(*), max(amount) into v_count, v_amount
  from transactions
  where user_id = '22222222-2222-2222-2222-222222222222' and type = 'quest_reward';
  perform pg_temp.assert(v_count = 1 and v_amount = 50, '台帳に quest_reward が50で1件だけ記帳される');

  select count(*) into v_count
  from economy_transactions
  where family_id = '12121212-1212-4212-8212-121212121212'
    and type = 'quest_reward'
    and from_account_type = 'treasury'
    and to_account_type = 'wallet'
    and to_user_id = '22222222-2222-2222-2222-222222222222'
    and amount = 50;
  perform pg_temp.assert(v_count = 1, '経済台帳に金庫からWalletへの報酬支払いが記帳される');
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

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  false
);

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

\echo '=== 8. 置いた装飾（Issue #223） ==='

insert into placed_decorations (id, user_id, asset_id, position_x, position_z, rotation_y, scale)
values ('44444444-4444-4444-4444-444444444444',
        '22222222-2222-2222-2222-222222222222', 'decoration-tree', 3, -4, 0.5, 1.2);

do $$
declare
  v_count integer;
  v_scale numeric;
  v_rotation numeric;
begin
  select count(*) into v_count
  from placed_decorations
  where user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.assert(v_count = 1, '置いた装飾が記録される');

  select scale, rotation_y into v_scale, v_rotation
  from placed_decorations
  where id = '44444444-4444-4444-4444-444444444444';
  perform pg_temp.assert(v_scale = 1.2 and v_rotation = 0.5, '大きさと向きが保たれる');
end;
$$;

-- 既定値。向きと大きさを省略しても、そのまま置ける形になる
do $$
declare
  v_rotation numeric;
  v_scale numeric;
begin
  insert into placed_decorations (id, user_id, asset_id, position_x, position_z)
  values ('55555555-5555-5555-5555-555555555555',
          '22222222-2222-2222-2222-222222222222', 'decoration-rock', 0, 0);

  select rotation_y, scale into v_rotation, v_scale
  from placed_decorations
  where id = '55555555-5555-5555-5555-555555555555';
  perform pg_temp.assert(v_rotation = 0 and v_scale = 1, '向き0・大きさ1が既定値になる');

  delete from placed_decorations where id = '55555555-5555-5555-5555-555555555555';
end;
$$;

-- 潰れて見えなくなる／裏返る値を入れさせない
select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z, scale)
     values ('22222222-2222-2222-2222-222222222222', 'decoration-tree', 0, 0, 0)$q$,
  '大きさ0の装飾');

select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z, scale)
     values ('22222222-2222-2222-2222-222222222222', 'decoration-tree', 0, 0, -1)$q$,
  '大きさが負の装飾');

-- 極端に大きいと、当たり判定（カタログの size × scale）が町を塞ぐ
select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z, scale)
     values ('22222222-2222-2222-2222-222222222222', 'decoration-tree', 0, 0, 50)$q$,
  '大きすぎる装飾');

-- numeric の 'NaN' は「すべての値より大きい」扱いなので `scale > 0` では落ちない。
-- between にしてあることを確かめる
select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z, scale)
     values ('22222222-2222-2222-2222-222222222222', 'decoration-tree', 0, 0, 'NaN')$q$,
  '大きさが NaN の装飾');

select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z)
     values ('22222222-2222-2222-2222-222222222222', '   ', 0, 0)$q$,
  '空のアセットID');

-- 遠くへ飛ばされたものを持たない
select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z)
     values ('22222222-2222-2222-2222-222222222222', 'decoration-tree', 9999, 0)$q$,
  '町から遠すぎる位置');

select pg_temp.assert_rejected(
  $q$insert into placed_decorations (user_id, asset_id, position_x, position_z)
     values ('00000000-0000-0000-0000-000000000000', 'decoration-tree', 0, 0)$q$,
  '存在しない利用者が置いた装飾');

-- 利用者を消したら、その人が置いたものも消える（on delete cascade）
do $$
declare
  v_count integer;
begin
  insert into users (id, name, role) values
    ('66666666-6666-6666-6666-666666666666', '消される人', 'child');
  insert into placed_decorations (user_id, asset_id, position_x, position_z)
    values ('66666666-6666-6666-6666-666666666666', 'decoration-rock', 1, 1);

  delete from bank_accounts where user_id = '66666666-6666-6666-6666-666666666666';
  delete from users where id = '66666666-6666-6666-6666-666666666666';

  select count(*) into v_count
  from placed_decorations
  where user_id = '66666666-6666-6666-6666-666666666666';
  perform pg_temp.assert(v_count = 0, '利用者を消すと置いた装飾も消える');
end;
$$;

\echo '=== 9. 所有と装備（Issue #222） ==='

-- 最初から持っている着せ替え品が配られている
-- （20260917000100_seed_starter_wearables.sql）
--
-- **対象をゲストユーザーの2人に絞る。** この検証スクリプト自身が後からテスト用の
-- 利用者を作るため、「users 全員」で数えると、配布のあとに増えた人まで数えてしまう
-- （seed_guest_users を足したときに件数の検証を壊したのと同じ形。Issue #211）。
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from (values
    ('00000000-0000-4000-8000-000000000001'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid)
  ) as g (user_id)
  cross join (values ('wearable-hat'), ('wearable-glasses')) as v (asset_id)
  where not exists (
    select 1 from owned_items o where o.user_id = g.user_id and o.asset_id = v.asset_id
  );
  perform pg_temp.assert(v_missing = 0, 'ゲストユーザーに着せ替え品が配られている');
end;
$$;

-- 装備の検証にはテスト用の利用者を使うため、その人にも持たせておく
insert into owned_items (user_id, asset_id) values
  ('22222222-2222-2222-2222-222222222222', 'wearable-hat'),
  ('22222222-2222-2222-2222-222222222222', 'wearable-glasses')
on conflict (user_id, asset_id) do nothing;

-- 持っているものは装備できる
insert into equipped_items (user_id, slot, asset_id)
values ('22222222-2222-2222-2222-222222222222', 'head', 'wearable-hat');

do $$
declare
  v_asset text;
begin
  select asset_id into v_asset
  from equipped_items
  where user_id = '22222222-2222-2222-2222-222222222222' and slot = 'head';
  perform pg_temp.assert(v_asset = 'wearable-hat', '持っているものを装備できる');
end;
$$;

-- **持っていないものは装備できない。** アプリ側のチェックだけに頼らない
select pg_temp.assert_rejected(
  $q$insert into equipped_items (user_id, slot, asset_id)
     values ('22222222-2222-2222-2222-222222222222', 'face', 'wearable-nonexistent')$q$,
  '持っていないものの装備');

-- 知らない枠は入れられない。付け先が無いまま保存されると、着せたのに出てこなくなる
select pg_temp.assert_rejected(
  $q$insert into equipped_items (user_id, slot, asset_id)
     values ('22222222-2222-2222-2222-222222222222', 'hand', 'wearable-hat')$q$,
  '知らない枠への装備');

-- 1つの枠に着けられるのは1つだけ
select pg_temp.assert_rejected(
  $q$insert into equipped_items (user_id, slot, asset_id)
     values ('22222222-2222-2222-2222-222222222222', 'head', 'wearable-glasses')$q$,
  '同じ枠に2つめの装備');

-- 空のアセットIDを持たない
select pg_temp.assert_rejected(
  $q$insert into owned_items (user_id, asset_id)
     values ('22222222-2222-2222-2222-222222222222', '   ')$q$,
  '空白だけの所有アイテム');

-- 存在しない利用者の所有を持たない
select pg_temp.assert_rejected(
  $q$insert into owned_items (user_id, asset_id)
     values ('00000000-0000-0000-0000-000000000000', 'wearable-hat')$q$,
  '存在しない利用者の所有');

-- 所有を取り消すと、その装備も一緒に外れる（on delete cascade）
do $$
declare
  v_count integer;
begin
  delete from owned_items
  where user_id = '22222222-2222-2222-2222-222222222222' and asset_id = 'wearable-hat';

  select count(*) into v_count
  from equipped_items
  where user_id = '22222222-2222-2222-2222-222222222222' and slot = 'head';
  perform pg_temp.assert(v_count = 0, '所有を取り消すと装備も外れる');

  -- 後続の検証のために戻す
  insert into owned_items (user_id, asset_id)
    values ('22222222-2222-2222-2222-222222222222', 'wearable-hat');
end;
$$;

-- 利用者を消したら、その人の所有も装備も消える（users → owned_items → equipped_items）
do $$
declare
  v_owned integer;
  v_equipped integer;
begin
  insert into users (id, name, role) values
    ('77777777-7777-7777-7777-777777777777', '消される人', 'child');
  insert into owned_items (user_id, asset_id)
    values ('77777777-7777-7777-7777-777777777777', 'wearable-hat');
  insert into equipped_items (user_id, slot, asset_id)
    values ('77777777-7777-7777-7777-777777777777', 'head', 'wearable-hat');

  delete from bank_accounts where user_id = '77777777-7777-7777-7777-777777777777';
  delete from users where id = '77777777-7777-7777-7777-777777777777';

  select count(*) into v_owned
  from owned_items where user_id = '77777777-7777-7777-7777-777777777777';
  select count(*) into v_equipped
  from equipped_items where user_id = '77777777-7777-7777-7777-777777777777';
  perform pg_temp.assert(
    v_owned = 0 and v_equipped = 0,
    '利用者を消すと所有も装備も消える'
  );
end;
$$;

\echo '=== すべての検証を通過しました ==='
