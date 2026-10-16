-- Issue #396: 親が「家事をしなくていい日」を決められ、その日は連続記録が途切れないようにする ----
--
-- 【何を作るか】
-- - quest_rest_days: 子供ごと・日付ごとの「家事をしなくていい日」（1人1日1行）
-- - set_quest_rest_days: 親が、家族の子供（1人でも複数人でも）の日付をまとめて設定・取り消す
-- - 連続日数の数え方（private.quest_streak_counting）を、家事をしなくていい日をまたげる形にする
-- - 時刻のお知らせ（private.run_scheduled_notifications）で、家事をしなくていい日はタスクをうながさない
--
-- 【決めたこと（Issue #396 で確認）】
-- - 設定するのは親。子供1人ずつにも、家族の複数人にまとめてもできる（行は子供ごとに持つ）
-- - さかのぼって設定・取り消しできるのは1週間前（日本時間の今日の7日前）まで。先の日付は1年先まで
--   （取り消しで、続いている連続記録が分かれる場合は断る。下の set_quest_rest_days を参照）
-- - 家事をしなくていい日は「やってもやらなくてもいい日」
--     - タスクが承認されていれば、ふつうの日と同じく連続日数に数える
--     - していなければ数えないが、記録は途切れない（前後がつながる）
--
-- 【連続日数の数え方】
-- 「続けた日」と「家事をしなくていい日」をあわせて日付の並びを作り、途切れずに続いている
-- かたまりのうち、最後に続けた日を含むものを今の記録とする。
--   - 日数: かたまりの中の「続けた日」の数（家事をしなくていい日だけの日は数えない）
--   - 始まった日: かたまりの中の最初の「続けた日」
--   - 続いているか: かたまりが昨日（または今日）まで届いていること。今日の分はまだこれからなので
--     今日は無くてもよい（#372 と同じ）。家事をしなくていい日で昨日まで届いていても続いている
-- 引数と戻り値は変えないので、お祝い（get_quest_streak / record_quest_streak_celebration）・
-- お祝いのお知らせ・途切れそうのお知らせは、そのまま新しい数え方になる。

-- 1. 家事をしなくていい日 ----------------------------------------------------------------------
create table public.quest_rest_days (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  rest_on date not null,
  -- 設定した親。親のアカウントが消えても、お休みの日は残す
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint quest_rest_days_user_rest_on_key unique (user_id, rest_on)
);

-- 家族のお休みの日を日付の範囲で読む（画面の取得・RLSの絞り込み）ため
create index quest_rest_days_family_id_rest_on_idx on public.quest_rest_days (family_id, rest_on);

alter table public.quest_rest_days enable row level security;

-- 家族のだれでも読める（子供が自分のお休みの日を、親が家族のお休みの日を見る）。
-- 書き込みは set_quest_rest_days だけ（日付の範囲と、親であることを確かめるため）
create policy quest_rest_days_select_family on public.quest_rest_days
for select to authenticated
using (family_id = (select public.current_user_family_id()));

create policy quest_rest_days_active_child_session on public.quest_rest_days as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

revoke all on table public.quest_rest_days from anon, authenticated;
grant select on table public.quest_rest_days to authenticated;

-- 2. その日が家事をしなくていい日か ------------------------------------------------------------
create or replace function private.is_quest_rest_day(p_user_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quest_rest_days
    where quest_rest_days.user_id = p_user_id and quest_rest_days.rest_on = p_day
  );
$$;

-- 3. 設定する・取り消す ------------------------------------------------------------------------
--
-- p_user_ids の子供それぞれの p_days を、p_is_rest が true なら家事をしなくていい日にし、
-- false なら取り消す。もうそうなっている組み合わせは何もしない。変わった行数を返す。
-- 1人でも家族の子供でない人が混ざっていたり、範囲外の日付が混ざっていたりしたら、全体を断る
-- （一部だけ反映されると、親が画面で見ていたものとずれるため）。
--
-- 【取り消しで、続いている連続記録が分かれる場合は断る】
-- お休みの日の前後でつながっていた記録は、その記録が始まった日（前半の最初の日）でお祝いを
-- 記録している。取り消すと今の記録は後半だけになり、始まった日が後ろへずれるため、
-- get_quest_streak がお祝い済みの日数を見つけられず、同じお祝い・お知らせがもう一度出てしまう
-- （PR #420 のレビュー）。記録が分かれる取り消しは、子供の記録を後から縮めることにもなるので断る。
-- 取り消して記録が途切れる（0日になる）場合や、終わった記録・今日より先の日の取り消しは、
-- お祝いの判定に影響しないので受け付ける。
create or replace function public.set_quest_rest_days(
  p_user_ids uuid[],
  p_days date[],
  p_is_rest boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_past_days constant integer := 7;
  c_max_future_days constant integer := 365;
  c_max_users constant integer := 50;
  c_max_days constant integer := 62;
  v_family_id uuid;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_user_ids uuid[];
  v_days date[];
  v_count integer;
  v_before_started date[];
  v_after_started date;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  select users.family_id into v_family_id
  from public.users
  where users.id = auth.uid() and users.role = 'parent';

  if v_family_id is null then
    raise exception '家事をしなくていい日を決められるのは親だけです';
  end if;

  if p_is_rest is null then
    raise exception '設定するか取り消すかを指定してください';
  end if;

  select array_agg(distinct ids.id) into v_user_ids
  from unnest(p_user_ids) as ids(id) where ids.id is not null;
  select array_agg(distinct days.day) into v_days
  from unnest(p_days) as days(day) where days.day is not null;

  if coalesce(cardinality(v_user_ids), 0) = 0 or cardinality(v_user_ids) > c_max_users then
    raise exception '子供を1人以上（%人まで）選んでください', c_max_users;
  end if;
  if coalesce(cardinality(v_days), 0) = 0 or cardinality(v_days) > c_max_days then
    raise exception '日付を1日以上（%日まで）選んでください', c_max_days;
  end if;

  if exists (
    select 1 from unnest(v_user_ids) as ids(id)
    where not exists (
      select 1 from public.users
      where users.id = ids.id and users.family_id = v_family_id and users.role = 'child'
    )
  ) then
    raise exception '同じ家族の子供だけ選べます';
  end if;

  if exists (
    select 1 from unnest(v_days) as days(day)
    where days.day < v_today - c_max_past_days or days.day > v_today + c_max_future_days
  ) then
    raise exception 'さかのぼれるのは%日前まで、先は%日後までです', c_max_past_days, c_max_future_days;
  end if;

  if p_is_rest then
    insert into public.quest_rest_days (family_id, user_id, rest_on, created_by)
    select v_family_id, ids.id, days.day, auth.uid()
    from unnest(v_user_ids) as ids(id) cross join unnest(v_days) as days(day)
    on conflict on constraint quest_rest_days_user_rest_on_key do nothing;
    get diagnostics v_count = row_count;
    return v_count;
  end if;

  -- 取り消す前に、続いている記録が始まった日を子供ごとに覚えておく（途切れていれば NULL）
  select array_agg(streak.started_on order by ids.ord)
  into v_before_started
  from unnest(v_user_ids) with ordinality as ids(id, ord)
  cross join lateral private.quest_streak_for(ids.id, v_today) as streak;

  delete from public.quest_rest_days
  where quest_rest_days.user_id = any (v_user_ids)
    and quest_rest_days.rest_on = any (v_days);
  get diagnostics v_count = row_count;

  for i in 1 .. cardinality(v_user_ids) loop
    select streak.started_on into v_after_started
    from private.quest_streak_for(v_user_ids[i], v_today) as streak;

    -- 取り消したあとも続いているのに、始まった日が変わった = 記録が分かれた。例外で取り消しごと戻す
    if v_before_started[i] is not null
      and v_after_started is not null
      and v_after_started is distinct from v_before_started[i] then
      raise exception '%の連続記録がこのお休みの日でつながっているため、取り消せません',
        private.notification_user_name(v_user_ids[i], '子供');
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.is_quest_rest_day(uuid, date) from public, anon, authenticated;
revoke all on function public.set_quest_rest_days(uuid[], date[], boolean) from public, anon;
grant execute on function public.set_quest_rest_days(uuid[], date[], boolean) to authenticated;

-- 4. 連続日数の数え方 --------------------------------------------------------------------------
-- 20261010073317 の版から、家事をしなくていい日をまたげるようにした。数え方は上の説明のとおり。
create or replace function private.quest_streak_counting(
  p_user_id uuid,
  p_today date,
  p_statuses text[],
  p_excluded_log_id uuid default null
)
returns table(current_days integer, started_on date, last_active_on date)
language sql
stable
security definer
set search_path = ''
as $$
  with active_days as (
    select distinct (quest_logs.completed_at at time zone 'Asia/Tokyo')::date as day
    from public.quest_logs
    where quest_logs.user_id = p_user_id
      and quest_logs.status = any (p_statuses)
      and quest_logs.id is distinct from p_excluded_log_id
      and (quest_logs.completed_at at time zone 'Asia/Tokyo')::date <= p_today
  ),
  -- 続けた日（active = true）と、続けていない家事をしなくていい日（active = false）
  all_days as (
    select active_days.day, true as active from active_days
    union all
    select quest_rest_days.rest_on, false
    from public.quest_rest_days
    where quest_rest_days.user_id = p_user_id
      and quest_rest_days.rest_on <= p_today
      and not exists (select 1 from active_days where active_days.day = quest_rest_days.rest_on)
  ),
  -- 日付が1日ずつ続いているかたまりに、同じ番号を付ける
  runs as (
    select all_days.day, all_days.active,
           all_days.day - (row_number() over (order by all_days.day))::integer as run_key
    from all_days
  ),
  latest_run as (
    select runs.* from runs
    where runs.run_key = (select runs.run_key from runs where runs.active order by runs.day desc limit 1)
  )
  select
    case when max(latest_run.day) >= p_today - 1
      then (count(*) filter (where latest_run.active))::integer else 0 end,
    case when max(latest_run.day) >= p_today - 1
      then min(latest_run.day) filter (where latest_run.active) end,
    max(latest_run.day) filter (where latest_run.active)
  from latest_run;
$$;

-- 5. 時刻のお知らせ ----------------------------------------------------------------------------
-- 20261010074018 の版から、次だけを変えた（ほかはそのまま）。
--   - 夕方: 家事をしなくていい日の子供には、しばらくしていない・デイリーの残りを知らせない。
--     「しばらくしていない」の日数には、家事をしなくていい日を数えない
--   - 夜: 途切れそうの判定を、家事をしなくていい日をはさんだ記録にも合わせる。
--     今日が家事をしなくていい日なら知らせない
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
revoke all on function private.run_scheduled_notifications(timestamptz) from public, anon, authenticated;
