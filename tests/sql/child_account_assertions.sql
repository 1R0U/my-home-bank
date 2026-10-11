-- Issue #264: 親だけが自分の家族へ子供アカウントを予約・作成できることを確認する。
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  %（拒否された: %）', p_label, replace(sqlerrm, E'\n', ' ');
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

insert into public.families (id, name) values
  ('26400000-0000-4000-8000-000000000001', '264家庭A'),
  ('26400000-0000-4000-8000-000000000002', '264家庭B');

insert into public.users (id, family_id, name, role, balance) values
  ('26400000-0000-4000-8000-000000000011', '26400000-0000-4000-8000-000000000001', '家庭Aの親', 'parent', 0),
  ('26400000-0000-4000-8000-000000000012', '26400000-0000-4000-8000-000000000001', '家庭Aの子', 'child', 0),
  ('26400000-0000-4000-8000-000000000021', '26400000-0000-4000-8000-000000000002', '家庭Bの親', 'parent', 0);

-- 家族を作る前の親（Auth登録直後の状態）
insert into public.users (id, name, role, balance) values
  ('26400000-0000-4000-8000-000000000031', '家族のない親', 'parent', 0);

\echo '=== 1. 予約できるのは家族のある親だけ ==='

set role authenticated;

select set_config('request.jwt.claim.sub', '26400000-0000-4000-8000-000000000012', false);
select pg_temp.assert_rejected(
  $q$select public.prepare_child_account('子供が作る子供')$q$,
  '子供による子供アカウントの予約'
);

select set_config('request.jwt.claim.sub', '26400000-0000-4000-8000-000000000031', false);
select pg_temp.assert_rejected(
  $q$select public.prepare_child_account('家族のない親の子')$q$,
  '家族のない親による予約'
);

select set_config('request.jwt.claim.sub', '26400000-0000-4000-8000-000000000011', false);
select pg_temp.assert_rejected(
  $q$select public.prepare_child_account('   ')$q$,
  '空の名前での予約'
);
select pg_temp.assert_rejected(
  format($q$select public.prepare_child_account(%L)$q$, repeat('長', 51)),
  '50文字を超える名前での予約'
);

select pg_temp.assert_rejected(
  $q$select * from private.pending_child_accounts$q$,
  'アプリからの予約テーブルの読み取り'
);

reset request.jwt.claim.sub;
select pg_temp.assert_rejected(
  $q$select public.prepare_child_account('未ログインの子')$q$,
  '未ログインでの予約'
);

reset role;

set role anon;
select pg_temp.assert_rejected(
  $q$select public.prepare_child_account('匿名の子')$q$,
  'anonロールからの予約'
);
reset role;

\echo '=== 2. 予約したメールでAuth登録すると、親の家族に子供として作られる ==='

set role authenticated;
select set_config('request.jwt.claim.sub', '26400000-0000-4000-8000-000000000011', false);
select public.prepare_child_account('  たろう  ') as child_email \gset
reset role;
reset request.jwt.claim.sub;

select pg_temp.assert(
  :'child_email' like 'child-%@children.my-home-bank.invalid',
  '内部用のメールアドレスが返る'
);

-- Edge Function（管理者権限）が作るのと同じく、metadataに役割は入れない
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '26400000-0000-4000-8000-000000000041',
  :'child_email',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
);

select pg_temp.assert(
  exists (
    select 1 from public.users
    where id = '26400000-0000-4000-8000-000000000041'
      and name = 'たろう'
      and role = 'child'
      and balance = 0
      and family_id = '26400000-0000-4000-8000-000000000001'
  ),
  '予約した親の家族に、予約した名前の子供が作られる'
);

select pg_temp.assert(
  exists (
    select 1 from public.bank_accounts
    where user_id = '26400000-0000-4000-8000-000000000041'
  ),
  '子供にも口座が作られる'
);

select pg_temp.assert(
  not exists (select 1 from private.pending_child_accounts where email = :'child_email'),
  '使った予約は消える'
);

select pg_temp.assert_rejected(
  format(
    $q$insert into auth.users (id, email, raw_user_meta_data)
       values ('26400000-0000-4000-8000-000000000042', %L, '{}'::jsonb)$q$,
    upper(:'child_email')
  ),
  '使い終わった予約のメールでの再登録'
);

\echo '=== 3. 期限切れの予約は使えない ==='

insert into private.pending_child_accounts (email, family_id, name, created_by, expires_at)
values (
  'child-expired@children.my-home-bank.invalid',
  '26400000-0000-4000-8000-000000000002',
  '期限切れの子',
  '26400000-0000-4000-8000-000000000021',
  now() - interval '1 second'
);

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, email, raw_user_meta_data)
     values (
       '26400000-0000-4000-8000-000000000043',
       'child-expired@children.my-home-bank.invalid',
       '{}'::jsonb
     )$q$,
  '期限切れの予約でのAuth登録'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '26400000-0000-4000-8000-000000000021', false);
select public.prepare_child_account('はなこ');
reset role;
reset request.jwt.claim.sub;

select pg_temp.assert(
  not exists (
    select 1 from private.pending_child_accounts
    where email = 'child-expired@children.my-home-bank.invalid'
  ),
  '次の予約のときに期限切れの予約が片付く'
);

\echo '=== 4. これまでの公開登録は変わらない ==='

select pg_temp.assert_rejected(
  $q$insert into auth.users (id, email, raw_user_meta_data)
     values (
       '26400000-0000-4000-8000-000000000044',
       'someone@example.com',
       '{"name":"公開登録の子供","role":"child"}'::jsonb
     )$q$,
  '予約のない公開登録でのchild役割指定'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '26400000-0000-4000-8000-000000000045',
  'parent@example.com',
  '{"name":"公開登録の親","role":"parent"}'::jsonb
);

select pg_temp.assert(
  exists (
    select 1 from public.users
    where id = '26400000-0000-4000-8000-000000000045'
      and role = 'parent'
      and family_id is null
  ),
  '予約のないメール登録は、これまでどおり家族のない親になる'
);
