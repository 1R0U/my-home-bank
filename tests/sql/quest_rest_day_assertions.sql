-- Issue #396: 家事をしなくていい日（quest_rest_days）と、連続記録・時刻のお知らせへの反映を確認する。
\set ON_ERROR_STOP on
\o /dev/null

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

create function pg_temp.assert_rejected(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'アサーション失敗: % （想定と違う理由で拒否された: %）', p_label, sqlerrm;
    end if;
    raise notice 'OK  %（拒否された: %）', p_label, sqlerrm;
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

-- 2026-05-20（日本時間）を「今日」として数える
create function pg_temp.on_day(p_day date, p_time time default '12:00')
returns timestamptz language sql as $$
  select (p_day + p_time) at time zone 'Asia/Tokyo';
$$;

create function pg_temp.rest_exists(p_user_id uuid, p_day date)
returns boolean language sql as $$
  select exists (select 1 from public.quest_rest_days where user_id = p_user_id and rest_on = p_day);
$$;

create function pg_temp.streak(p_user_id uuid, p_statuses text[] default array['approved'])
returns table(current_days integer, started_on date, last_active_on date) language sql as $$
  select * from private.quest_streak_counting(p_user_id, date '2026-05-20', p_statuses);
$$;

insert into public.families (id, name) values
  ('39600000-0000-4000-8000-000000000001', '396家庭'),
  ('39600000-0000-4000-8000-000000000002', '396別の家庭');

insert into public.users (id, family_id, name, role, balance) values
  ('39600000-0000-4000-8000-000000000011', '39600000-0000-4000-8000-000000000001', '396の親', 'parent', 0),
  ('39600000-0000-4000-8000-000000000012', '39600000-0000-4000-8000-000000000001', '396の子A', 'child', 0),
  ('39600000-0000-4000-8000-000000000013', '39600000-0000-4000-8000-000000000001', '396の子B', 'child', 0),
  ('39600000-0000-4000-8000-000000000014', '39600000-0000-4000-8000-000000000001', '396の子C', 'child', 0),
  ('39600000-0000-4000-8000-000000000015', '39600000-0000-4000-8000-000000000001', '396の子D', 'child', 0),
  ('39600000-0000-4000-8000-000000000021', '39600000-0000-4000-8000-000000000002', '396別の親', 'parent', 0),
  ('39600000-0000-4000-8000-000000000022', '39600000-0000-4000-8000-000000000002', '396別の子', 'child', 0);

insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000001', '396クエスト', '', 10, 'open', '39600000-0000-4000-8000-000000000011', 'limited', null);

-- 子A: 5/14・15・16 承認、5/17・18 お休み（していない）、5/19 承認。→ 4日、5/14から
-- 子B: 5/16 承認、5/17〜19 お休み（していない）。→ 1日。今日やらなくても途切れていない
-- 子C: 5/17 承認、5/18 お休みで承認済み、5/19 承認。→ 3日（お休みの日にやった日も数える）
-- 子D: 5/15 承認、5/17 お休み（していない）。5/16 が空いているので途切れている → 0日
insert into public.quest_logs (quest_id, user_id, status, completed_at) values
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000012', 'approved', pg_temp.on_day('2026-05-14')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000012', 'approved', pg_temp.on_day('2026-05-15')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000012', 'approved', pg_temp.on_day('2026-05-16')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000012', 'approved', pg_temp.on_day('2026-05-19')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000013', 'approved', pg_temp.on_day('2026-05-16')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000014', 'approved', pg_temp.on_day('2026-05-17')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000014', 'approved', pg_temp.on_day('2026-05-18')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000014', 'approved', pg_temp.on_day('2026-05-19')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000015', 'approved', pg_temp.on_day('2026-05-15'));

-- 連続記録 ------------------------------------------------------------------------------------
select pg_temp.assert(
  (select current_days = 1 from pg_temp.streak('39600000-0000-4000-8000-000000000012')),
  'お休みの日を入れる前は、空いた日で途切れる（子Aは1日）'
);

-- 過去の日付のお休みは、テストでは直接入れる（RPCは今日から1週間前までしか受け付けないため）
insert into public.quest_rest_days (family_id, user_id, rest_on) values
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000012', '2026-05-17'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000012', '2026-05-18'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000013', '2026-05-17'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000013', '2026-05-18'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000013', '2026-05-19'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000014', '2026-05-18'),
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000015', '2026-05-17'),
  -- 先の日付のお休みは、今日までの数え方に関係しない
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000015', '2026-05-25');

select pg_temp.assert(
  (select current_days = 4 and started_on = '2026-05-14' and last_active_on = '2026-05-19'
   from pg_temp.streak('39600000-0000-4000-8000-000000000012')),
  'お休みの日をはさんで前後がつながり、お休みの日は日数に数えない（子A: 4日）'
);
select pg_temp.assert(
  (select current_days = 1 and started_on = '2026-05-16' and last_active_on = '2026-05-16'
   from pg_temp.streak('39600000-0000-4000-8000-000000000013')),
  '昨日までお休みが続いていれば、最後に続けた日が前でも途切れていない（子B: 1日）'
);
select pg_temp.assert(
  (select current_days = 3 and started_on = '2026-05-17'
   from pg_temp.streak('39600000-0000-4000-8000-000000000014')),
  'お休みの日にタスクをしたら、その日も数える（子C: 3日）'
);
select pg_temp.assert(
  (select current_days = 0 and started_on is null and last_active_on = '2026-05-15'
   from pg_temp.streak('39600000-0000-4000-8000-000000000015')),
  'お休みでない空いた日があれば途切れる（子D: 0日）'
);
select pg_temp.assert(
  (select current_days = 0 from private.quest_streak_counting(
     '39600000-0000-4000-8000-000000000012', date '2026-05-22', array['approved'])),
  'お休みの日のあと、お休みでない日を2日空けると途切れる'
);

-- 設定する（親） ------------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000011', true);

create temporary table set_result on commit drop as
select public.set_quest_rest_days(
  array['39600000-0000-4000-8000-000000000012', '39600000-0000-4000-8000-000000000013']::uuid[],
  array[(now() at time zone 'Asia/Tokyo')::date - 7, (now() at time zone 'Asia/Tokyo')::date + 30],
  true
) as changed;
select pg_temp.assert((select changed = 4 from set_result), '親は、複数の子供・複数の日付をまとめてお休みにできる');

select pg_temp.assert(
  public.set_quest_rest_days(
    array['39600000-0000-4000-8000-000000000012']::uuid[],
    array[(now() at time zone 'Asia/Tokyo')::date + 30],
    true
  ) = 0,
  'もうお休みの日を、もう一度お休みにしても何もしない'
);
select pg_temp.assert(
  public.set_quest_rest_days(
    array['39600000-0000-4000-8000-000000000013']::uuid[],
    array[(now() at time zone 'Asia/Tokyo')::date + 30],
    false
  ) = 1,
  '子供1人ずつ取り消せる'
);
select pg_temp.assert(
  (select count(*) = 3 from public.quest_rest_days
   where rest_on >= (now() at time zone 'Asia/Tokyo')::date - 7
     and user_id in ('39600000-0000-4000-8000-000000000012', '39600000-0000-4000-8000-000000000013')),
  '取り消した分だけ消え、ほかは残る'
);

select pg_temp.assert_rejected(
  format('select public.set_quest_rest_days(%L::uuid[], array[%L::date], true)',
    '{39600000-0000-4000-8000-000000000012}', (now() at time zone 'Asia/Tokyo')::date - 8),
  'さかのぼれるのは7日前まで',
  '8日以上前にはさかのぼれない'
);
select pg_temp.assert_rejected(
  format('select public.set_quest_rest_days(%L::uuid[], array[%L::date], false)',
    '{39600000-0000-4000-8000-000000000012}', (now() at time zone 'Asia/Tokyo')::date - 8),
  'さかのぼれるのは7日前まで',
  '8日以上前のお休みは取り消せない（途切れた記録を後から変えすぎない）'
);
select pg_temp.assert_rejected(
  format('select public.set_quest_rest_days(%L::uuid[], array[%L::date], true)',
    '{39600000-0000-4000-8000-000000000012}', (now() at time zone 'Asia/Tokyo')::date + 366),
  '365日後まで',
  '1年より先には設定できない'
);
select pg_temp.assert_rejected(
  format('select public.set_quest_rest_days(%L::uuid[], array[current_date], true)',
    '{39600000-0000-4000-8000-000000000012,39600000-0000-4000-8000-000000000022}'),
  '同じ家族の子供だけ',
  '別の家族の子供が混ざっていたら、全体を断る'
);
select pg_temp.assert_rejected(
  format('select public.set_quest_rest_days(%L::uuid[], array[current_date], true)',
    '{39600000-0000-4000-8000-000000000011}'),
  '同じ家族の子供だけ',
  '親（大人）はお休みの対象にできない'
);
select pg_temp.assert_rejected(
  'select public.set_quest_rest_days(array[]::uuid[], array[current_date], true)',
  '子供を1人以上',
  '子供を選ばずには設定できない'
);
select pg_temp.assert_rejected(
  $q$select public.set_quest_rest_days(array['39600000-0000-4000-8000-000000000012']::uuid[], array[]::date[], true)$q$,
  '日付を1日以上',
  '日付を選ばずには設定できない'
);
select pg_temp.assert_rejected(
  $q$insert into public.quest_rest_days (family_id, user_id, rest_on)
     values ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000012', current_date)$q$,
  'permission denied',
  'アプリからは直接書き込めない'
);

-- 取り消しで、続いている連続記録が分かれる場合は断る（PR #420 のレビュー） --------------------
-- 子E: 5日前・4日前に承認、3日前がお休み、2日前・昨日に承認 → 4日続いていて、3日のお祝い済み
-- 子F: 4日前に承認、3日前〜昨日がお休み → 1日続いている（昨日までお休み）
reset role;
insert into public.users (id, family_id, name, role, balance) values
  ('39600000-0000-4000-8000-000000000016', '39600000-0000-4000-8000-000000000001', '396の子E', 'child', 0),
  ('39600000-0000-4000-8000-000000000017', '39600000-0000-4000-8000-000000000001', '396の子F', 'child', 0);
insert into public.quest_logs (quest_id, user_id, status, completed_at)
select '39600000-0000-4000-8000-000000000101', logs.user_id::uuid, 'approved',
       (((now() at time zone 'Asia/Tokyo')::date - logs.days_ago) + time '12:00') at time zone 'Asia/Tokyo'
from (values
  ('39600000-0000-4000-8000-000000000016', 5), ('39600000-0000-4000-8000-000000000016', 4),
  ('39600000-0000-4000-8000-000000000016', 2), ('39600000-0000-4000-8000-000000000016', 1),
  ('39600000-0000-4000-8000-000000000017', 4)
) as logs(user_id, days_ago);
insert into public.quest_rest_days (family_id, user_id, rest_on)
select '39600000-0000-4000-8000-000000000001', rests.user_id::uuid, (now() at time zone 'Asia/Tokyo')::date - rests.days_ago
from (values
  ('39600000-0000-4000-8000-000000000016', 3),
  ('39600000-0000-4000-8000-000000000017', 3), ('39600000-0000-4000-8000-000000000017', 2),
  ('39600000-0000-4000-8000-000000000017', 1)
) as rests(user_id, days_ago);
insert into public.quest_streak_celebrations (user_id, streak_started_on, milestone_days)
values ('39600000-0000-4000-8000-000000000016', (now() at time zone 'Asia/Tokyo')::date - 5, 3);

set role authenticated;
select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected(
  format($q$select public.set_quest_rest_days(array['39600000-0000-4000-8000-000000000016']::uuid[], array[%L::date], false)$q$,
    (now() at time zone 'Asia/Tokyo')::date - 3),
  'つながっているため、取り消せません',
  '取り消すと続いている記録が前後に分かれるお休みの日は、取り消せない'
);
reset role;
select pg_temp.assert(
  pg_temp.rest_exists('39600000-0000-4000-8000-000000000016', (now() at time zone 'Asia/Tokyo')::date - 3),
  '断ったときは、お休みの日が残る'
);
select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000016', true);
set role authenticated;
select pg_temp.assert(
  (select current_days = 4 and pending_milestone is null from public.get_quest_streak()),
  '記録は分かれず、お祝い済みの3日がもう一度出ない'
);

select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000011', true);
select pg_temp.assert(
  public.set_quest_rest_days(
    array['39600000-0000-4000-8000-000000000017']::uuid[],
    array[(now() at time zone 'Asia/Tokyo')::date - 1],
    false
  ) = 1,
  '取り消して記録が途切れる（分かれずに0日になる）場合は、取り消せる'
);
reset role;
select pg_temp.assert(
  (select current_days = 0 from private.quest_streak_for(
     '39600000-0000-4000-8000-000000000017', (now() at time zone 'Asia/Tokyo')::date)),
  '取り消したお休みの日は、もう途切れない日ではない'
);
set role authenticated;

-- 子供は設定できないが、家族のお休みの日は見られる
select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  $q$select public.set_quest_rest_days(array['39600000-0000-4000-8000-000000000012']::uuid[], array[current_date], true)$q$,
  '親だけ',
  '子供は自分のお休みの日を決められない'
);
select pg_temp.assert(
  (select count(*) > 0 from public.quest_rest_days),
  '子供は家族のお休みの日を見られる'
);

-- 別の家族からは見えない
select set_config('request.jwt.claim.sub', '39600000-0000-4000-8000-000000000021', true);
select pg_temp.assert(
  (select count(*) = 0 from public.quest_rest_days),
  '別の家族のお休みの日は見えない'
);
select pg_temp.assert_rejected(
  $q$select public.set_quest_rest_days(array['39600000-0000-4000-8000-000000000012']::uuid[], array[current_date], true)$q$,
  '同じ家族の子供だけ',
  '別の家族の親は設定できない'
);
reset role;

-- 時刻のお知らせ --------------------------------------------------------------------------------
-- 子A（5/19まで4日、今日5/20はまだ）: 途切れそうを知らせる。最後に続けた日が昨日でなくても同じ
-- 子B（5/16に1日、5/17〜19お休み）: 2日に届かないので知らせない
-- 子C（5/19まで3日）: 今日をお休みにしたので、途切れそうもデイリーの残りも知らせない
insert into public.quest_rest_days (family_id, user_id, rest_on) values
  ('39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000014', '2026-05-20');
insert into public.quests
  (family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('39600000-0000-4000-8000-000000000001', '396デイリー', '', 10, 'open', '39600000-0000-4000-8000-000000000011', 'daily', null);

-- 「しばらくしていない」（PR #420 のレビュー）。登録日を前にして、登録日で日数が決まらないようにする
-- 子G: 5/13に申請し、5/14〜19がお休み → お休みを除くと1日。7日として知らせない
-- 子H: 5/17に申請し、お休みなし → 3日。これまでどおり知らせる
insert into public.users (id, family_id, name, role, balance, created_at) values
  ('39600000-0000-4000-8000-000000000018', '39600000-0000-4000-8000-000000000001', '396の子G', 'child', 0, '2026-01-01'),
  ('39600000-0000-4000-8000-000000000019', '39600000-0000-4000-8000-000000000001', '396の子H', 'child', 0, '2026-01-01');
insert into public.quest_logs (quest_id, user_id, status, completed_at) values
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000018', 'approved', pg_temp.on_day('2026-05-13')),
  ('39600000-0000-4000-8000-000000000101', '39600000-0000-4000-8000-000000000019', 'approved', pg_temp.on_day('2026-05-17'));
insert into public.quest_rest_days (family_id, user_id, rest_on)
select '39600000-0000-4000-8000-000000000001', '39600000-0000-4000-8000-000000000018', day::date
from generate_series(date '2026-05-14', date '2026-05-19', interval '1 day') as day;

select private.run_scheduled_notifications('2026-05-20 20:00+09');

select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '39600000-0000-4000-8000-000000000012' and dedupe_key = 'streak_risk:2026-05-20'
            and title = 'れんぞく4にちが とぎれそう！'),
  'お休みの日をはさんで続いている記録も、途切れそうを知らせる'
);
select pg_temp.assert(
  not exists (select 1 from public.notifications
              where user_id = '39600000-0000-4000-8000-000000000014'
                and dedupe_key in ('streak_risk:2026-05-20', 'daily_left:2026-05-20', 'inactive:2026-05-20')),
  '今日がお休みの日の子供には、途切れそう・デイリーの残り・しばらくしていないを知らせない'
);
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '39600000-0000-4000-8000-000000000012' and dedupe_key = 'daily_left:2026-05-20'),
  'お休みでない子供には、これまでどおりデイリーの残りを知らせる'
);

select pg_temp.assert(
  not exists (select 1 from public.notifications
              where user_id = '39600000-0000-4000-8000-000000000018' and dedupe_key = 'inactive:2026-05-20'),
  'お休み明けの日は、お休みの日を「していない日」に数えない（7日として知らせない）'
);
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '39600000-0000-4000-8000-000000000019' and dedupe_key = 'inactive:2026-05-20'
            and body like '3にち%'),
  'お休みでない子供には、これまでどおり「しばらくしていない」を知らせる'
);

rollback;
