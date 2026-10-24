-- このマイグレーションで行う変更を記述してください。
-- Issue #263 / PR #499: 期間同期の失敗を子供ごとに隔離し、通知と戻り件数の整合性を保つ。
-- Issue #263: デイリーの残りを通知する前に現在の期間を作り、対象の子の分だけ数える。
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
        select users.id, users.birth_date from public.users
        where users.family_id = v_child.family_id and users.birth_date is not null
      loop
       begin
        -- 当日
        if private.birthday_in_year(v_member.birth_date, v_year) = v_today then
          if private.notify(
            v_child.id,
            case when v_member.id = v_child.id
              then 'おたんじょうび おめでとう！'
              else 'きょうは ' || private.notification_user_name(v_member.id, 'かぞく') || 'の おたんじょうび！' end,
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
              else 'あと' || c_birthday_days_before || 'にちで ' || private.notification_user_name(v_member.id, 'かぞく') || 'の おたんじょうび' end,
            case when v_member.id = v_child.id
              then 'たのしみだね。'
              else 'なにか できることを かんがえてみよう。' end,
            null,
            'birthday:' || v_member.id::text || ':' || extract(year from v_target)::integer || ':before'
          ) then v_count := v_count + 1; end if;
        end if;
       exception when others then
        raise warning 'お知らせを作れませんでした（誕生日 % → %）: %', v_member.id, v_child.id, sqlerrm;
       end;
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
     begin
      if v_loan.days_left in (c_loan_days_before, 0) and v_loan.remaining > 0 then
        if private.notify(
          v_loan.borrower_id,
          case when v_loan.days_left = 0
            then 'きょうは ローンの へんさいびだよ'
            else 'ローンの へんさいびまで あと' || v_loan.days_left || 'にち' end,
          'のこり ' || to_char(v_loan.remaining, 'FM9,999,999,999,999,999') || ' ゴル。ぎんこうで かえそう。',
          'bank',
          'loan_due:' || v_loan.id::text || ':' || v_loan.days_left
        ) then v_count := v_count + 1; end if;
      end if;
     exception when others then
      raise warning 'お知らせを作れませんでした（返済日 %）: %', v_loan.id, sqlerrm;
     end;
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
      -- 親あてのイベント（こどもの日）は、子供が1人以上いる家族の親にだけ届ける
      for v_child in
        select users.id from public.users
        where users.role = v_event.role and users.family_id is not null
          and (
            v_event.role <> 'parent'
            or exists (
              select 1 from public.users as children
              where children.family_id = users.family_id and children.role = 'child'
            )
          )
      loop
       begin
        if private.notify(
          v_child.id, v_event.title, v_event.body, v_event.route,
          'event:' || v_event.name || ':' || v_year || ':' || v_event.days_before
        ) then v_count := v_count + 1; end if;
       exception when others then
        raise warning 'お知らせを作れませんでした（イベント % → %）: %', v_event.name, v_child.id, sqlerrm;
       end;
      end loop;
    end loop;
  end if;

  -- 夕方: しばらくしていない・デイリーの残り（子供あて） ---------------------------------------
  if v_hour >= c_evening_hour then
    for v_child in
      select users.id, users.family_id, users.created_at from public.users
      where users.role = 'child' and users.family_id is not null
    loop
     begin
      -- #396 家事をしなくていい日は、タスクをうながすお知らせを出さない
      if private.is_quest_rest_day(v_child.id, v_today) then
        continue;
      end if;

      -- #367 最後にタスクの申請か家事の申請をした日から、何日たったか
      select greatest(
        (select max(quest_logs.completed_at) from public.quest_logs where quest_logs.user_id = v_child.id),
        (select max(task_reports.created_at) from public.task_reports where task_reports.reported_by = v_child.id),
        v_child.created_at
      ) at time zone 'Asia/Tokyo' into v_last_active_at;
      v_last_active := v_last_active_at::date;
      -- #396 お休みの日は「していない日」に数えない（お休み明けに「7にち していない」と届かないように）。
      -- 今日がお休みの日なら、この夕方のお知らせは上で飛ばしている
      v_days := v_today - v_last_active - (
        select count(*)::integer from public.quest_rest_days
        where quest_rest_days.user_id = v_child.id
          and quest_rest_days.rest_on > v_last_active
          and quest_rest_days.rest_on < v_today
      );

      if v_days = any (c_inactive_days) then
        if private.notify(
          v_child.id,
          'さいきん タスクを していないね',
          v_days || 'にち タスクを していないよ。できそうな ものから はじめてみよう。',
          'tasks',
          'inactive:' || v_today::text
        ) then v_count := v_count + 1; end if;
      end if;

      -- 同期だけをロールバックし、既に作った「しばらくしていない」通知と件数を保つ。
      begin
        perform private.sync_quest_periods(v_child.family_id, p_now);
      exception when others then
        raise warning 'クエスト期間を同期できませんでした（家族 %）: %', v_child.family_id, sqlerrm;
        -- 同期前のタスクで残件数を通知しない。次の子供の処理は続ける。
        continue;
      end;

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
          and (quests.period_ends_at is null or (quests.period_starts_at <= p_now and quests.period_ends_at > p_now))
          and (quests.audience = 'first' or quests.target_child_id = v_child.id)
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
     exception when others then
      raise warning 'お知らせを作れませんでした（夕方 %）: %', v_child.id, sqlerrm;
     end;
    end loop;
  end if;

  -- 夜: 連続記録が途切れそう（子供あて） ----------------------------------------------------
  -- 昨日まで続いていて、今日はまだタスクを申請していないとき。
  -- ここでは承認待ちの申請も「続けた日」として数える。昨日の分がまだ承認待ちでも、承認されれば
  -- 記録は続くので、「今日やれば続く」ことに変わりはないため（PR #405 のレビュー）。
  -- 今日すでに申請していれば（承認待ちでも）最後の日が今日になり、知らせない。
  -- #396 家事をしなくていい日をはさんで続いている記録も対象にする（最後に続けた日が昨日とは限らない）。
  -- 今日が家事をしなくていい日なら、今日やらなくても途切れないので知らせない。
  if v_hour >= c_streak_risk_hour then
    for v_child in
      select users.id from public.users
      where users.role = 'child' and users.family_id is not null
    loop
     begin
      select streak.current_days, streak.last_active_on into v_streak_days, v_streak_last
      from private.quest_streak_counting(v_child.id, v_today, array['pending', 'approved']) as streak;

      if coalesce(v_streak_days, 0) >= c_streak_risk_min_days
        and v_streak_last < v_today
        and not private.is_quest_rest_day(v_child.id, v_today) then
        if private.notify(
          v_child.id,
          'れんぞく' || v_streak_days || 'にちが とぎれそう！',
          'きょうも 1つ やって、きろくを のばそう。',
          'tasks',
          'streak_risk:' || v_today::text
        ) then v_count := v_count + 1; end if;
      end if;
     exception when others then
      raise warning 'お知らせを作れませんでした（途切れそう %）: %', v_child.id, sqlerrm;
     end;
    end loop;
  end if;

  return v_count;
end;
$$;
