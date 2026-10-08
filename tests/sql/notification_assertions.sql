-- Issue #354: お知らせ（notifications）が本人にだけ見え、既読にできるかを確認する。
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
  ('35400000-0000-4000-8000-000000000001', '354家庭');

insert into public.users (id, family_id, name, role, balance) values
  ('35400000-0000-4000-8000-000000000011', '35400000-0000-4000-8000-000000000001', '354の親', 'parent', 0),
  ('35400000-0000-4000-8000-000000000012', '35400000-0000-4000-8000-000000000001', '354の子', 'child', 0);

insert into public.notifications (id, user_id, title, body, route, created_at) values
  ('35400000-0000-4000-8000-000000000101', '35400000-0000-4000-8000-000000000011', '親あて1', '', 'tasks', now() - interval '2 hours'),
  ('35400000-0000-4000-8000-000000000102', '35400000-0000-4000-8000-000000000011', '親あて2', '', null, now() - interval '1 hour'),
  ('35400000-0000-4000-8000-000000000103', '35400000-0000-4000-8000-000000000011', '親あて3', '', 'store', now()),
  ('35400000-0000-4000-8000-000000000201', '35400000-0000-4000-8000-000000000012', '子あて1', '', 'bank', now());

-- 制約: 見出しが空・未知の行き先は入れられない
select pg_temp.assert_rejected(
  $q$insert into public.notifications (user_id, title) values
     ('35400000-0000-4000-8000-000000000011', '   ')$q$,
  '見出しが空白だけのお知らせ');
select pg_temp.assert_rejected(
  $q$insert into public.notifications (user_id, title, route) values
     ('35400000-0000-4000-8000-000000000011', '行き先が変', '/settings')$q$,
  '未知の行き先のお知らせ');

set role authenticated;
select set_config('request.jwt.claim.sub', '35400000-0000-4000-8000-000000000011', false);

select pg_temp.assert(
  (select count(*) from public.notifications) = 3,
  '自分あてのお知らせだけが見える（子あては見えない）'
);
select pg_temp.assert(
  (select count(*) from public.notifications where read_at is null) = 3,
  '届いたお知らせは未読から始まる'
);

-- アプリからは作れない・直接書き換えられない
select pg_temp.assert_rejected(
  $q$insert into public.notifications (user_id, title) values
     ('35400000-0000-4000-8000-000000000011', '自作のお知らせ')$q$,
  'アプリからお知らせを作る');
select pg_temp.assert_rejected(
  $q$update public.notifications set read_at = now()
     where id = '35400000-0000-4000-8000-000000000101'$q$,
  'アプリから既読の時刻を直接書き換える');
select pg_temp.assert_rejected(
  $q$delete from public.notifications
     where id = '35400000-0000-4000-8000-000000000101'$q$,
  'アプリからお知らせを消す');

-- 1件だけ既読にする。子あてのidを混ぜても無視される
select pg_temp.assert(
  public.mark_notifications_read(array[
    '35400000-0000-4000-8000-000000000101',
    '35400000-0000-4000-8000-000000000201'
  ]::uuid[]) = 1,
  '指定した自分あての1件だけが既読になる'
);
select pg_temp.assert(
  (select read_at is not null from public.notifications
   where id = '35400000-0000-4000-8000-000000000101'),
  '既読にしたお知らせに読んだ時刻が入る'
);

-- 既読のものをもう一度指定しても、件数に数えず時刻も変えない
do $$
declare
  v_before timestamptz;
  v_count integer;
begin
  select read_at into v_before from public.notifications
  where id = '35400000-0000-4000-8000-000000000101';
  v_count := public.mark_notifications_read(array['35400000-0000-4000-8000-000000000101']::uuid[]);
  perform pg_temp.assert(v_count = 0, '既読のものを既読にしても件数に数えない');
  perform pg_temp.assert(
    (select read_at from public.notifications
     where id = '35400000-0000-4000-8000-000000000101') = v_before,
    '既読の時刻は最初に読んだときのまま'
  );
end;
$$;

-- NULL ですべて既読にする
select pg_temp.assert(
  public.mark_notifications_read(null) = 2,
  'NULLを渡すと残りの未読がすべて既読になる'
);
select pg_temp.assert(
  (select count(*) from public.notifications where read_at is null) = 0,
  '自分あての未読がなくなる'
);

reset role;
reset request.jwt.claim.sub;

select pg_temp.assert(
  (select read_at is null from public.notifications
   where id = '35400000-0000-4000-8000-000000000201'),
  '親が「すべて既読」にしても、子あてのお知らせは未読のまま'
);

-- ログインしていない呼び出しは拒否する
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.assert_rejected(
  $q$select public.mark_notifications_read(null)$q$,
  'ログインしていない既読操作');
reset role;
reset request.jwt.claim.sub;

-- 利用者を消すと、その人あてのお知らせも消える（on delete cascade）。
-- 家庭に属する子供を消すとお財布の流通量の記録（トリガー）まで動くため、
-- ここでは家庭に属さない利用者で、お知らせの cascade だけを確かめる
insert into public.users (id, name, role) values
  ('35400000-0000-4000-8000-000000000013', '354の消える人', 'parent');
insert into public.notifications (user_id, title) values
  ('35400000-0000-4000-8000-000000000013', '消える人あて');
delete from public.bank_accounts where user_id = '35400000-0000-4000-8000-000000000013';
delete from public.users where id = '35400000-0000-4000-8000-000000000013';
select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35400000-0000-4000-8000-000000000013') = 0,
  '利用者を消すとその人あてのお知らせも消える'
);

\o
\echo === お知らせ（notifications）の検証が完了しました ===
