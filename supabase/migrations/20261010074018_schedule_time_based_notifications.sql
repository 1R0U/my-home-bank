-- 時刻をきっかけに、お知らせを作る -------------------------------------------------------
--
-- 20261010073317 で作った private.notify を使い、日付や時刻をきっかけにするお知らせを作る。
-- 操作がきっかけのもの（承認待ち・申請・ストアの更新など）は 20261010073317 にある。
--
-- | Issue | だれあて | 何を                                     | 時刻（日本時間） | 行き先 |
-- | ----- | -------- | ---------------------------------------- | ---------------- | ------ |
-- | #363  | 子供     | 家族の誕生日（当日と1週間前）            | 8時から          | なし   |
-- | #364  | 子供     | ローンの返済日（3日前と当日）            | 8時から          | bank   |
-- | #359  | 親       | こどもの日（1週間前と当日）              | 8時から          | store / なし |
-- | #368  | 子供     | 母の日・父の日（3日前と当日）、こどもの日（当日） | 8時から | tasks / なし |
-- | #362  | 子供     | 今日のデイリータスクの残り               | 17時から         | tasks  |
-- | #367  | 子供     | しばらくタスクをしていない（3日・7日）   | 17時から         | tasks  |
-- | #366  | 子供     | 連続記録が今日で途切れそう               | 19時から         | tasks  |
--
-- 【動かし方】
-- pg_cron で毎時5分に private.run_scheduled_notifications() を呼ぶ（自動積立と同じ形）。
-- 各お知らせは「その時刻を過ぎていて、まだ作っていなければ作る」。同じお知らせは
-- private.notify の重複防止キー（日付入り）で1日1回・1件だけになるので、何度呼ばれてもよく、
-- 止まっていた時間があっても、その日のうちなら次の実行で追いつく。
--
-- 【値を変えるとき】
-- 時刻・何日前かは run_scheduled_notifications の先頭の定数にまとめている。

-- 1. 誕生日をその年の日付にする -------------------------------------------------------------
-- 2月29日生まれは、うるう年でない年は2月28日として扱う。
create or replace function private.birthday_in_year(p_birth_date date, p_year integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from p_birth_date) = 2 and extract(day from p_birth_date) = 29
      and not (p_year % 4 = 0 and (p_year % 100 <> 0 or p_year % 400 = 0))
      then make_date(p_year, 2, 28)
    else make_date(p_year, extract(month from p_birth_date)::integer, extract(day from p_birth_date)::integer)
  end;
$$;

-- 2. その月の第n日曜日 ----------------------------------------------------------------------
-- 母の日（5月の第2日曜日）・父の日（6月の第3日曜日）に使う。
create or replace function private.nth_sunday(p_year integer, p_month integer, p_nth integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(p_year, p_month, 1)
    + ((7 - extract(dow from make_date(p_year, p_month, 1))::integer) % 7)
    + (p_nth - 1) * 7;
$$;

-- 3. 時刻をきっかけにするお知らせをまとめて作る ------------------------------------------------
--
-- p_now を渡すと、その時刻として動く（テスト用）。作ったお知らせの件数を返す。
create or replace function private.run_scheduled_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 何時から知らせるか（日本時間）
  c_morning_hour constant integer := 8;
  c_evening_hour constant integer := 17;
  c_streak_risk_hour constant integer := 19;
  -- 何日前に知らせるか
  c_birthday_days_before constant integer := 7;
  c_loan_days_before constant integer := 3;
  c_childrens_day_days_before constant integer := 7;
  c_parents_day_days_before constant integer := 3;
  -- 何日タスクをしていなかったら知らせるか
  c_inactive_days constant integer[] := array[3, 7];
  -- 途切れそうと知らせる連続日数の下限
  c_streak_risk_min_days constant integer := 2;

  v_local timestamp := p_now at time zone 'Asia/Tokyo';
  v_today date := v_local::date;
  v_hour integer := extract(hour from v_local)::integer;
  v_year integer := extract(year from v_local)::integer;
  v_count integer := 0;
  v_child record;
  v_member record;
  v_loan record;
  v_event record;
  v_left integer;
  v_required integer;
  v_last_active date;
  v_days integer;
  v_streak_days integer;
  v_streak_last date;
  v_target date;
  v_last_active_at timestamp;
begin
  -- 朝: 誕生日・返済日・イベント -------------------------------------------------------------
  if v_hour >= c_morning_hour then
    -- #363 家族の誕生日（子供あて）
    for v_child in
      select users.id, users.family_id from public.users
      where users.role = 'child' and users.family_id is not null
    loop
      for v_member in
        select users.id, users.name, users.birth_date from public.users
        where users.family_id = v_child.family_id and users.birth_date is not null
      loop
        -- 当日
        if private.birthday_in_year(v_member.birth_date, v_year) = v_today then
          if private.notify(
            v_child.id,
            case when v_member.id = v_child.id
              then 'おたんじょうび おめでとう！'
              else 'きょうは ' || v_member.name || 'の おたんじょうび！' end,
            case when v_member.id = v_child.id
              then 'すてきな いちにちに なりますように。'
              else 'おめでとうを つたえよう。' end,
            null,
            'birthday:' || v_member.id::text || ':' || v_year || ':today'
          ) then v_count := v_count + 1; end if;
        end if;

        -- 1週間前（年をまたぐ場合があるので、その日付の年で求める）
        v_target := v_today + c_birthday_days_before;
        if private.birthday_in_year(v_member.birth_date, extract(year from v_target)::integer) = v_target then
          if private.notify(
            v_child.id,
            case when v_member.id = v_child.id
              then 'あと' || c_birthday_days_before || 'にちで おたんじょうび！'
              else 'あと' || c_birthday_days_before || 'にちで ' || v_member.name || 'の おたんじょうび' end,
            case when v_member.id = v_child.id
              then 'たのしみだね。'
              else 'なにか できることを かんがえてみよう。' end,
            null,
            'birthday:' || v_member.id::text || ':' || extract(year from v_target)::integer || ':before'
          ) then v_count := v_count + 1; end if;
        end if;
      end loop;
    end loop;

    -- #364 ローンの返済日（借りた子供あて）
    for v_loan in
      select loans.id, loans.borrower_id,
             (loans.due_at at time zone 'Asia/Tokyo')::date - v_today as days_left,
             (loans.principal_amount + loans.interest_amount
               - loans.principal_repaid - loans.interest_repaid) as remaining
      from public.loans
      join public.users on users.id = loans.borrower_id and users.role = 'child'
      where loans.status = 'active'
    loop
      if v_loan.days_left in (c_loan_days_before, 0) and v_loan.remaining > 0 then
        if private.notify(
          v_loan.borrower_id,
          case when v_loan.days_left = 0
            then 'きょうは ローンの へんさいびだよ'
            else 'ローンの へんさいびまで あと' || v_loan.days_left || 'にち' end,
          'のこり ' || to_char(v_loan.remaining, 'FM999,999,999,999,999') || ' ゴル。ぎんこうで かえそう。',
          'bank',
          'loan_due:' || v_loan.id::text || ':' || v_loan.days_left
        ) then v_count := v_count + 1; end if;
      end if;
    end loop;

    -- #359 / #368 イベント
    for v_event in
      select * from (values
        -- 名前, 日付, 何日前, だれあて, 見出し, 本文, 行き先
        ('childrens_day', make_date(v_year, 5, 5), c_childrens_day_days_before, 'parent',
         c_childrens_day_days_before || '日後はこどもの日です',
         '子供へのごほうびを、ストアに用意してみませんか。', 'store'),
        ('childrens_day', make_date(v_year, 5, 5), 0, 'parent',
         '今日はこどもの日です', '子供のがんばりを、ほめてあげましょう。', null),
        ('childrens_day', make_date(v_year, 5, 5), 0, 'child',
         'きょうは こどものひ！', 'いつも おてつだい ありがとう。', null),
        ('mothers_day', private.nth_sunday(v_year, 5, 2), c_parents_day_days_before, 'child',
         'あと' || c_parents_day_days_before || 'にちで ははのひ', 'おてつだいで ありがとうを つたえよう。', 'tasks'),
        ('mothers_day', private.nth_sunday(v_year, 5, 2), 0, 'child',
         'きょうは ははのひ', 'ありがとうを つたえよう。', 'tasks'),
        ('fathers_day', private.nth_sunday(v_year, 6, 3), c_parents_day_days_before, 'child',
         'あと' || c_parents_day_days_before || 'にちで ちちのひ', 'おてつだいで ありがとうを つたえよう。', 'tasks'),
        ('fathers_day', private.nth_sunday(v_year, 6, 3), 0, 'child',
         'きょうは ちちのひ', 'ありがとうを つたえよう。', 'tasks')
      ) as events(name, day, days_before, role, title, body, route)
      where events.day - events.days_before = v_today
    loop
      for v_child in
        select users.id from public.users
        where users.role = v_event.role and users.family_id is not null
      loop
        if private.notify(
          v_child.id, v_event.title, v_event.body, v_event.route,
          'event:' || v_event.name || ':' || v_year || ':' || v_event.days_before
        ) then v_count := v_count + 1; end if;
      end loop;
    end loop;
  end if;

  -- 夕方: しばらくしていない・デイリーの残り（子供あて） ---------------------------------------
  if v_hour >= c_evening_hour then
    for v_child in
      select users.id, users.family_id, users.created_at from public.users
      where users.role = 'child' and users.family_id is not null
    loop
      -- #367 最後にタスクの申請か家事の申請をした日から、何日たったか
      select greatest(
        (select max(quest_logs.completed_at) from public.quest_logs where quest_logs.user_id = v_child.id),
        (select max(task_reports.created_at) from public.task_reports where task_reports.reported_by = v_child.id),
        v_child.created_at
      ) at time zone 'Asia/Tokyo' into v_last_active_at;
      v_last_active := v_last_active_at::date;
      v_days := v_today - v_last_active;

      if v_days = any (c_inactive_days) then
        if private.notify(
          v_child.id,
          'さいきん タスクを していないね',
          v_days || 'にち タスクを していないよ。できそうな ものから はじめてみよう。',
          'tasks',
          'inactive:' || v_today::text
        ) then v_count := v_count + 1; end if;
      end if;

      -- #362 今日のデイリータスクの残り。しばらくしていないお知らせを出した日は重ねない
      if not exists (
        select 1 from public.notifications
        where notifications.user_id = v_child.id and notifications.dedupe_key = 'inactive:' || v_today::text
      ) then
        select count(*)::integer, count(*) filter (where quests.is_required)::integer
        into v_left, v_required
        from public.quests
        where quests.family_id = v_child.family_id
          and quests.category = 'daily'
          and (
            (quests.status = 'open' and (quests.assigned_to is null or quests.assigned_to = v_child.id))
            or (quests.status = 'accepted' and quests.assigned_to = v_child.id)
          );

        if v_left > 0 then
          if private.notify(
            v_child.id,
            'きょうの デイリータスクが あと' || v_left || 'こ あるよ',
            case when v_required > 0
              then 'そのうち ひっすが ' || v_required || 'こ あるよ。'
              else 'できるものから やってみよう。' end,
            'tasks',
            'daily_left:' || v_today::text
          ) then v_count := v_count + 1; end if;
        end if;
      end if;
    end loop;
  end if;

  -- 夜: 連続記録が途切れそう（子供あて） ----------------------------------------------------
  -- 昨日まで続いていて、今日はまだタスクを申請していない（承認待ちでもよい）とき。
  if v_hour >= c_streak_risk_hour then
    for v_child in
      select users.id from public.users
      where users.role = 'child' and users.family_id is not null
    loop
      select streak.current_days, streak.last_active_on into v_streak_days, v_streak_last
      from private.quest_streak_for(v_child.id, v_today) as streak;

      if coalesce(v_streak_days, 0) >= c_streak_risk_min_days
        and v_streak_last = v_today - 1
        and not exists (
          select 1 from public.quest_logs
          where quest_logs.user_id = v_child.id
            and quest_logs.status in ('pending', 'approved')
            and (quest_logs.completed_at at time zone 'Asia/Tokyo')::date = v_today
        )
      then
        if private.notify(
          v_child.id,
          'れんぞく' || v_streak_days || 'にちが とぎれそう！',
          'きょうも 1つ やって、きろくを のばそう。',
          'tasks',
          'streak_risk:' || v_today::text
        ) then v_count := v_count + 1; end if;
      end if;
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function private.birthday_in_year(date, integer) from public, anon, authenticated;
revoke all on function private.nth_sunday(integer, integer, integer) from public, anon, authenticated;
revoke all on function private.run_scheduled_notifications(timestamptz) from public, anon, authenticated;

-- 4. 毎時5分に動かす ------------------------------------------------------------------------
-- 自動積立（20260928000100）と同じく、pg_cron が無い環境（CIの素の PostgreSQL など）では
-- 予定を入れずに知らせるだけにする。
do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'scheduled-notifications-hourly',
      '5 * * * *',
      'select private.run_scheduled_notifications();'
    );
  else
    raise notice 'pg_cronがありません。時刻をきっかけにするお知らせの定期実行にはpg_cron対応環境が必要です';
  end if;
end;
$schedule$;
