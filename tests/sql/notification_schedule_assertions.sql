-- 時刻をきっかけにお知らせが作られるかを確認する（#359 #362 #363 #364 #366 #367 #368）。
-- 時刻は private.run_scheduled_notifications に渡して固定する（2026年5月の日本時間）。
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

create function pg_temp.has(p_user_id uuid, p_title text)
returns boolean language sql as $$
  select exists (select 1 from public.notifications where user_id = p_user_id and title = p_title);
$$;

create function pg_temp.count_for(p_user_id uuid, p_key_prefix text)
returns integer language sql as $$
  select count(*)::integer from public.notifications
  where user_id = p_user_id and dedupe_key like p_key_prefix || '%';
$$;

-- 日付の計算 -----------------------------------------------------------------------------
select pg_temp.assert(
  private.nth_sunday(2026, 5, 2) = '2026-05-10' and private.nth_sunday(2026, 6, 3) = '2026-06-21'
    and private.nth_sunday(2027, 5, 2) = '2027-05-09',
  '母の日は5月の第2日曜日、父の日は6月の第3日曜日'
);
select pg_temp.assert(
  private.birthday_in_year('2012-02-29', 2026) = '2026-02-28'
    and private.birthday_in_year('2012-02-29', 2028) = '2028-02-29',
  '2月29日生まれは、うるう年でない年は2月28日'
);

-- 家庭: 親P・子A（5/5生まれ）・子B（2/29生まれ）・子C（しばらくしていない）・子D（連続記録）・子E（今日も申請済み）
insert into public.families (id, name) values
  ('36200000-0000-4000-8000-000000000001', '362家庭');

insert into public.users (id, family_id, name, role, balance, birth_date, created_at) values
  ('36200000-0000-4000-8000-000000000011', '36200000-0000-4000-8000-000000000001', 'おかあさん', 'parent', 0, '1985-05-12', '2026-01-01'),
  ('36200000-0000-4000-8000-000000000012', '36200000-0000-4000-8000-000000000001', 'あおい', 'child', 0, '2015-05-05', '2026-01-01'),
  ('36200000-0000-4000-8000-000000000013', '36200000-0000-4000-8000-000000000001', 'うみ', 'child', 0, '2016-02-29', '2026-01-01'),
  ('36200000-0000-4000-8000-000000000014', '36200000-0000-4000-8000-000000000001', 'かい', 'child', 0, null, '2026-05-02 12:00+09'),
  ('36200000-0000-4000-8000-000000000015', '36200000-0000-4000-8000-000000000001', 'そら', 'child', 0, null, '2026-01-01'),
  ('36200000-0000-4000-8000-000000000016', '36200000-0000-4000-8000-000000000001', 'りく', 'child', 0, null, '2026-01-01');

-- 朝より前は何も作らない ----------------------------------------------------------------
select private.run_scheduled_notifications('2026-05-05 07:59+09');
select pg_temp.assert(
  not exists (select 1 from public.notifications where user_id = '36200000-0000-4000-8000-000000000012'),
  '8時より前は、誕生日やイベントのお知らせを作らない'
);

-- #363 誕生日 ----------------------------------------------------------------------------
select private.run_scheduled_notifications('2026-05-05 08:30+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000012', 'おたんじょうび おめでとう！'),
  '#363 自分の誕生日の当日に、本人へ届く'
);
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000013', 'きょうは あおいの おたんじょうび！'),
  '#363 家族の子供の誕生日の当日に、ほかの子供へ届く'
);
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000012', 'あと7にちで おかあさんの おたんじょうび')
    and pg_temp.has('36200000-0000-4000-8000-000000000013', 'あと7にちで おかあさんの おたんじょうび'),
  '#363 親の誕生日の1週間前に、子供へ届く'
);
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000011', 'birthday:') = 0,
  '#363 誕生日のお知らせは親には届かない'
);

select private.run_scheduled_notifications('2026-02-28 09:00+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000013', 'おたんじょうび おめでとう！'),
  '#363 2月29日生まれは、うるう年でない年は2月28日に届く'
);

-- #359 / #368 イベント -------------------------------------------------------------------
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000011', '今日はこどもの日です')
    and pg_temp.has('36200000-0000-4000-8000-000000000012', 'きょうは こどものひ！'),
  '#359 #368 こどもの日の当日に、親と子供へ届く'
);
select private.run_scheduled_notifications('2026-04-28 08:00+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000011', '7日後はこどもの日です')
    and not pg_temp.has('36200000-0000-4000-8000-000000000012', '7日後はこどもの日です'),
  '#359 こどもの日の1週間前は、親にだけ届く'
);
select private.run_scheduled_notifications('2026-05-07 08:00+09');
select private.run_scheduled_notifications('2026-05-10 08:00+09');
select private.run_scheduled_notifications('2026-06-21 08:00+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000012', 'あと3にちで ははのひ')
    and pg_temp.has('36200000-0000-4000-8000-000000000012', 'きょうは ははのひ')
    and pg_temp.has('36200000-0000-4000-8000-000000000012', 'きょうは ちちのひ'),
  '#368 母の日の3日前と当日、父の日の当日に、子供へ届く'
);
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000011', 'event:mothers_day') = 0,
  '#368 母の日・父の日は親には届かない'
);

-- #364 返済日 ----------------------------------------------------------------------------
insert into public.loans
  (id, family_id, borrower_id, requested_amount, purpose, status, monthly_interest_rate, term_days,
   principal_amount, interest_amount, principal_repaid, interest_repaid, request_idempotency_key,
   approved_at, due_at) values
  ('36400000-0000-4000-8000-000000000001', '36200000-0000-4000-8000-000000000001', '36200000-0000-4000-8000-000000000012',
   1000, 'じてんしゃ', 'active', 0.01, 10, 1000, 10, 300, 0, '364-key-1', '2026-04-28 10:00+09', '2026-05-08 23:00+09');

select private.run_scheduled_notifications('2026-05-05 09:00+09');
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '36200000-0000-4000-8000-000000000012'
            and title = 'ローンの へんさいびまで あと3にち'
            and body = 'のこり 710 ゴル。ぎんこうで かえそう。' and route = 'bank'),
  '#364 返済日の3日前に、残りの額とともに届く'
);
select private.run_scheduled_notifications('2026-05-06 09:00+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000012', 'loan_due:') = 1,
  '#364 3日前と当日のあいだの日には届かない'
);
select private.run_scheduled_notifications('2026-05-08 09:00+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000012', 'きょうは ローンの へんさいびだよ'),
  '#364 返済日の当日にも届く'
);

-- #362 デイリーの残り / #367 しばらくしていない ------------------------------------------------
insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to, is_required) values
  ('36200000-0000-4000-8000-000000000101', '36200000-0000-4000-8000-000000000001', 'はみがき', '', 10, 'open', '36200000-0000-4000-8000-000000000011', 'daily', null, true),
  ('36200000-0000-4000-8000-000000000102', '36200000-0000-4000-8000-000000000001', 'しゅくだい', '', 10, 'open', '36200000-0000-4000-8000-000000000011', 'daily', null, false),
  ('36200000-0000-4000-8000-000000000103', '36200000-0000-4000-8000-000000000001', 'うみの係', '', 10, 'accepted', '36200000-0000-4000-8000-000000000011', 'daily', '36200000-0000-4000-8000-000000000013', false),
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000001', 'しゅうまつ', '', 10, 'open', '36200000-0000-4000-8000-000000000011', 'weekly', null, false);

select private.run_scheduled_notifications('2026-05-05 16:59+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000012', 'daily_left:') = 0,
  '#362 17時より前は、デイリーの残りを知らせない'
);

select private.run_scheduled_notifications('2026-05-05 17:05+09');
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '36200000-0000-4000-8000-000000000012'
            and title = 'きょうの デイリータスクが あと2こ あるよ' and body = 'そのうち ひっすが 1こ あるよ。'),
  '#362 受けられるデイリータスクの数と、そのうち必須の数を知らせる（週ごとのタスクは数えない）'
);
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000013', 'きょうの デイリータスクが あと3こ あるよ'),
  '#362 自分が受けたデイリータスクも残りに数える'
);
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '36200000-0000-4000-8000-000000000014'
            and title = 'さいきん タスクを していないね' and body like '3にち%'),
  '#367 3日タスクをしていない子供に届く'
);
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000014', 'daily_left:') = 0,
  '#367 しばらくしていないお知らせを出した日は、デイリーの残りを重ねない'
);
select private.run_scheduled_notifications('2026-05-06 17:05+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000014', 'inactive:') = 1,
  '#367 3日と7日のあいだの日には届かない'
);
select private.run_scheduled_notifications('2026-05-09 17:05+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000014', 'inactive:') = 2,
  '#367 7日たったときにもう一度届く'
);

-- #366 連続記録が途切れそう -------------------------------------------------------------------
-- そら: 5/3・5/4 は承認済みで、5/5 はまだ / りく: 同じで、5/5 は承認待ちの申請がある
insert into public.quest_logs (quest_id, user_id, status, completed_at) values
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000015', 'approved', '2026-05-03 12:00+09'),
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000015', 'approved', '2026-05-04 12:00+09'),
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000016', 'approved', '2026-05-03 12:00+09'),
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000016', 'approved', '2026-05-04 12:00+09'),
  ('36200000-0000-4000-8000-000000000104', '36200000-0000-4000-8000-000000000016', 'pending', '2026-05-05 12:00+09');

select private.run_scheduled_notifications('2026-05-05 18:59+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000015', 'streak_risk:') = 0,
  '#366 19時より前は、途切れそうを知らせない'
);
select private.run_scheduled_notifications('2026-05-05 19:05+09');
select pg_temp.assert(
  pg_temp.has('36200000-0000-4000-8000-000000000015', 'れんぞく2にちが とぎれそう！'),
  '#366 昨日まで続いていて今日まだなら、途切れそうと届く'
);
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000016', 'streak_risk:') = 0,
  '#366 今日すでに申請していれば（承認待ちでも）届かない'
);

-- 何度動いても、同じお知らせは1回だけ -----------------------------------------------------------
create temporary table before_rerun as
  select user_id, count(*) as n from public.notifications group by user_id;
select private.run_scheduled_notifications('2026-05-05 19:30+09');
select private.run_scheduled_notifications('2026-05-05 23:59+09');
select pg_temp.assert(
  not exists (
    select 1 from public.notifications n
    group by n.user_id
    having count(*) <> coalesce((select b.n from before_rerun b where b.user_id = n.user_id), 0)
  ),
  '同じ日に何度動いても、お知らせは増えない'
);

-- 通知をオフにしている人には作らない
update public.users set notifications_enabled = false where id = '36200000-0000-4000-8000-000000000015';
select private.run_scheduled_notifications('2026-05-07 19:05+09');
select pg_temp.assert(
  pg_temp.count_for('36200000-0000-4000-8000-000000000015', 'daily_left:2026-05-07') = 0
    and pg_temp.count_for('36200000-0000-4000-8000-000000000012', 'daily_left:2026-05-07') = 1,
  '通知をオフにしている子供には届かない'
);

-- アプリからは呼べない
select pg_temp.assert(
  not has_function_privilege('authenticated', 'private.run_scheduled_notifications(timestamptz)'::regprocedure, 'execute')
    and not has_function_privilege('anon', 'private.run_scheduled_notifications(timestamptz)'::regprocedure, 'execute'),
  'アプリ（anon / authenticated）は定期のお知らせを動かせない'
);
