-- Issue #372: 子供の連続記録（get_quest_streak）と、お祝いの記録（record_quest_streak_celebration）を確認する。
\set ON_ERROR_STOP on
\o /dev/null

-- now() を全体で1つの時刻にそろえ、日本時間の0時をまたいで実行しても「今日」がずれないようにする
begin;

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

-- 日本時間で今日から p_days_ago 日前の、p_time の時刻
create function pg_temp.jst(p_days_ago integer, p_time time default '12:00')
returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Tokyo')::date - p_days_ago) + p_time) at time zone 'Asia/Tokyo';
$$;

create function pg_temp.jst_today_minus(p_days_ago integer)
returns date language sql as $$
  select (now() at time zone 'Asia/Tokyo')::date - p_days_ago;
$$;

insert into public.families (id, name) values
  ('37200000-0000-4000-8000-000000000001', '372家庭'),
  ('37200000-0000-4000-8000-000000000002', '372別の家庭');

insert into public.users (id, family_id, name, role, balance) values
  ('37200000-0000-4000-8000-000000000011', '37200000-0000-4000-8000-000000000001', '372の親', 'parent', 0),
  ('37200000-0000-4000-8000-000000000012', '37200000-0000-4000-8000-000000000001', '372の子A', 'child', 0),
  ('37200000-0000-4000-8000-000000000013', '37200000-0000-4000-8000-000000000001', '372の子B', 'child', 0),
  ('37200000-0000-4000-8000-000000000014', '37200000-0000-4000-8000-000000000001', '372の子C', 'child', 0),
  ('37200000-0000-4000-8000-000000000015', '37200000-0000-4000-8000-000000000001', '372の子D', 'child', 0),
  ('37200000-0000-4000-8000-000000000016', '37200000-0000-4000-8000-000000000001', '372の子E', 'child', 0),
  ('37200000-0000-4000-8000-000000000021', '37200000-0000-4000-8000-000000000002', '372別の親', 'parent', 0);

insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000001', '372クエスト', '', 10, 'open', '37200000-0000-4000-8000-000000000011', 'daily', null);

-- 子A: 今日・昨日・2日前は承認済み（今日は2件）、3日前は承認待ち、4日前は却下、5・6日前は承認済み
-- 子B: 昨日・2日前だけ承認済み（今日はまだ）
-- 子C: 2日前だけ承認済み（昨日も今日もしていない）
-- 子D: 昨日の23:30と今日の0:30（日本時間）。日付の区切りが日本時間であることを見る
-- 子E: 何もしていない
insert into public.quest_logs (quest_id, user_id, status, completed_at) values
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(0, '08:00')),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(0, '18:00')),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(1)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(2)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'pending', pg_temp.jst(3)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'rejected', pg_temp.jst(4)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(5)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000012', 'approved', pg_temp.jst(6)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000013', 'approved', pg_temp.jst(1)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000013', 'approved', pg_temp.jst(2)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000014', 'approved', pg_temp.jst(2)),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000015', 'approved', pg_temp.jst(1, '23:30')),
  ('37200000-0000-4000-8000-000000000101', '37200000-0000-4000-8000-000000000015', 'approved', pg_temp.jst(0, '00:30'));

-- キリのいい日数
select pg_temp.assert(
  (select bool_and(private.is_quest_streak_milestone(d)) from unnest(array[3, 7, 10, 30, 60, 90, 100, 365, 1000]) as d),
  '3・7・10・100・365・1000日と、30日ごとはキリのいい日数'
);
select pg_temp.assert(
  (select not bool_or(private.is_quest_streak_milestone(d)) from unnest(array[0, 1, 2, 4, 29, 31, 99, 364, 999]) as d),
  'それ以外はキリのいい日数ではない'
);

-- 子A本人として見る
set role authenticated;
select set_config('request.jwt.claim.sub', '37200000-0000-4000-8000-000000000012', false);

select pg_temp.assert(
  (select current_days = 3 and started_on = pg_temp.jst_today_minus(2)
          and last_active_on = pg_temp.jst_today_minus(0) and pending_milestone = 3
   from public.get_quest_streak()),
  '承認済みの日だけを数え、承認待ち・却下の日で途切れる（同じ日の2件は1日）'
);

-- アプリからお祝いを直接作れない
select pg_temp.assert_rejected(
  $q$insert into public.quest_streak_celebrations (user_id, streak_started_on, milestone_days)
     values ('37200000-0000-4000-8000-000000000012', current_date, 3)$q$,
  'アプリからお祝いを直接作る');

select pg_temp.assert_rejected(
  'select public.record_quest_streak_celebration(7)',
  '届いていない日数のお祝いを記録する');
select pg_temp.assert_rejected(
  'select public.record_quest_streak_celebration(2)',
  'キリのよくない日数のお祝いを記録する');
select pg_temp.assert_rejected(
  'select public.record_quest_streak_celebration(null)',
  '日数なしでお祝いを記録する');

select pg_temp.assert(
  public.record_quest_streak_celebration(3),
  '届いたキリのいい日数のお祝いを記録できる'
);
select pg_temp.assert(
  not public.record_quest_streak_celebration(3),
  '同じお祝いをもう一度記録しても増えない'
);
select pg_temp.assert(
  (select count(*) = 1 from public.quest_streak_celebrations),
  '自分のお祝いの記録が見える'
);
select pg_temp.assert(
  (select pending_milestone is null from public.get_quest_streak()),
  'お祝いした後は、まだのお祝いがなくなる'
);

-- 3日前の承認待ちが後から承認されると、3日前からの4日の記録になる（4日前は却下のまま）。
-- 始まった日が前へずれても、ずれる前に祝った3日は祝い直さない
reset role;
update public.quest_logs set status = 'approved'
where user_id = '37200000-0000-4000-8000-000000000012' and status = 'pending';
set role authenticated;
select set_config('request.jwt.claim.sub', '37200000-0000-4000-8000-000000000012', false);

select pg_temp.assert(
  (select current_days = 4 and started_on = pg_temp.jst_today_minus(3) and pending_milestone is null
   from public.get_quest_streak()),
  '後から承認された日で記録が伸びても、祝った日数は祝い直さない'
);

-- 4日前の却下も承認に変わると7日つながり、7日のお祝いが出る
reset role;
update public.quest_logs set status = 'approved'
where user_id = '37200000-0000-4000-8000-000000000012' and status = 'rejected';
set role authenticated;
select set_config('request.jwt.claim.sub', '37200000-0000-4000-8000-000000000012', false);

select pg_temp.assert(
  (select current_days = 7 and started_on = pg_temp.jst_today_minus(6) and pending_milestone = 7
   from public.get_quest_streak()),
  '途切れていた日が埋まって7日になると、7日のお祝いが出る'
);

-- ほかの子供の記録（同じ家族なので見られる）
select pg_temp.assert(
  (select current_days = 2 and started_on = pg_temp.jst_today_minus(2) and pending_milestone is null
   from public.get_quest_streak('37200000-0000-4000-8000-000000000013')),
  '最後に続けたのが昨日なら、今日まだでも記録は続いている'
);
select pg_temp.assert(
  (select current_days = 0 and started_on is null and last_active_on = pg_temp.jst_today_minus(2)
          and pending_milestone is null
   from public.get_quest_streak('37200000-0000-4000-8000-000000000014')),
  '昨日も今日もしていなければ途切れて0日になる'
);
select pg_temp.assert(
  (select current_days = 2 from public.get_quest_streak('37200000-0000-4000-8000-000000000015')),
  '日付は日本時間で区切る（23:30と翌0:30は別の日）'
);
select pg_temp.assert(
  (select current_days = 0 and started_on is null and last_active_on is null
   from public.get_quest_streak('37200000-0000-4000-8000-000000000016')),
  '一度もしていなければ0日'
);

-- 親
select set_config('request.jwt.claim.sub', '37200000-0000-4000-8000-000000000011', false);
select pg_temp.assert(
  (select current_days = 7 from public.get_quest_streak('37200000-0000-4000-8000-000000000012')),
  '親は同じ家族の子供の記録を見られる'
);
select pg_temp.assert(
  (select current_days = 0 and pending_milestone is null from public.get_quest_streak()),
  '親自身には記録をつけない'
);
select pg_temp.assert(
  (select count(*) = 0 from public.quest_streak_celebrations),
  '子供のお祝いの記録は親からは見えない'
);
select pg_temp.assert_rejected(
  'select public.record_quest_streak_celebration(3)',
  '親がお祝いを記録する');

-- 別の家族の親
select set_config('request.jwt.claim.sub', '37200000-0000-4000-8000-000000000021', false);
select pg_temp.assert_rejected(
  $q$select * from public.get_quest_streak('37200000-0000-4000-8000-000000000012')$q$,
  '別の家族の子供の記録を見る');

-- ログインしていない
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.assert_rejected(
  'select * from public.get_quest_streak()',
  'ログインせずに記録を見る');

reset role;
reset request.jwt.claim.sub;

commit;
