-- Issue #372: 子供の連続記録と、キリのいい日数のお祝いを記録する -------------------------
--
-- 【「1日続けた」の条件】
-- 承認されたタスク（quest_logs.status = 'approved'）が1つ以上ある日を「続けた日」とする。
-- 日付は承認した日ではなく **申請した日**（completed_at）を日本時間で区切って数える。
-- 親の承認が翌日以降になっても、申請した日の分として後から埋まる。
-- 承認待ち（pending）・却下（rejected）は数えない。
--
-- 【連続日数の数え方】
-- 最後に続けた日から1日ずつさかのぼり、途切れるまでの日数を連続日数とする。
-- 最後に続けた日が今日か昨日なら、記録は続いている（今日の分はまだこれからなので）。
-- それより前なら途切れており、0日とする。
-- 家事をしなくていい日（途切れない日）は #396 で足す。それまでは1日でも空けば0に戻る。
--
-- 連続日数は保存せず、毎回 quest_logs から数え直す。承認が後から来て過去の日が埋まると
-- 記録が伸びたりつながったりするため、保存すると数え直しの仕組みが別に要る。
--
-- 【対象は子供だけ】
-- タスクをこなすのは子供なので、子供（users.role = 'child'）だけに記録をつける。
--
-- 【お祝いの記録（quest_streak_celebrations）】
-- キリのいい日数に届いたら、子供の画面でお祝いの演出を1回だけ出す。
-- 同じお祝いを何度も出さないよう、出したことをこのテーブルに残す。
-- どの連続記録でのお祝いかを「その連続記録が始まった日（streak_started_on）」で区別する。
-- 一度途切れて同じ日数にもう一度届いたら、それは別の記録としてまたお祝いする。
-- 記録は家庭で共有しないので、notifications と同じく family_id は持たせず本人にだけ紐づける。
-- 今は演出だけで、ごほうび（アイテムなど）は渡さない。渡す仕組みは #397 で足す。

create table if not exists public.quest_streak_celebrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  streak_started_on date not null,
  milestone_days integer not null,
  celebrated_at timestamptz not null default now(),

  constraint quest_streak_celebrations_milestone_days_positive
    check (milestone_days > 0),
  constraint quest_streak_celebrations_user_streak_milestone_key
    unique (user_id, streak_started_on, milestone_days)
);

alter table public.quest_streak_celebrations enable row level security;

create policy quest_streak_celebrations_select_self on public.quest_streak_celebrations
for select to authenticated using (user_id = auth.uid());

revoke all on table public.quest_streak_celebrations from anon, authenticated;
-- 読むだけを許可する。記録するのは下の record_quest_streak_celebration 経由に限る
-- （届いていない日数のお祝いを勝手に作れないようにするため。#397 でごほうびを渡すときの前提になる）。
grant select on table public.quest_streak_celebrations to authenticated;

-- 連続記録は本人の承認済みの完了申請だけを読む。quest_logs には家庭ごとのインデックスしかなく、
-- 開くたびに全家庭の行を読むことになるので、本人の承認済みの行だけを引けるようにする。
create index if not exists quest_logs_user_id_approved_completed_at_idx
  on public.quest_logs (user_id, completed_at)
  where status = 'approved';

-- キリのいい日数か ----------------------------------------------------------------------
--
-- 3日・1週間・10日・100日・1年・1000日と、1か月（30日）ごと。
-- アプリ側の lib/questStreak.ts の QUEST_STREAK_MILESTONES と同じ日数にすること。
create or replace function private.is_quest_streak_milestone(p_days integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_days in (3, 7, 10, 100, 365, 1000) or (p_days > 0 and p_days % 30 = 0);
$$;

revoke all on function private.is_quest_streak_milestone(integer) from public, anon, authenticated;

-- 連続記録を数える（権限の確認はしない。呼び出し元で確認すること） ------------------------
--
-- 戻り値は必ず1行。
--   current_days   : 連続日数（途切れていれば0）
--   started_on     : 続いている記録が始まった日（途切れていれば NULL）
--   last_active_on : 最後に続けた日（一度も続けていなければ NULL）
create or replace function private.quest_streak_for(p_user_id uuid, p_today date)
returns table (current_days integer, started_on date, last_active_on date)
language sql
stable
security definer
set search_path = ''
as $$
  with active_days as (
    select distinct (quest_logs.completed_at at time zone 'Asia/Tokyo')::date as day
    from public.quest_logs
    where quest_logs.user_id = p_user_id
      and quest_logs.status = 'approved'
      and (quest_logs.completed_at at time zone 'Asia/Tokyo')::date <= p_today
  ),
  ordered as (
    select active_days.day, row_number() over (order by active_days.day desc) as rn
    from active_days
  ),
  -- 新しい順に並べたとき、最後に続けた日から rn - 1 日前と一致する間は途切れていない
  latest_run as (
    select ordered.day
    from ordered
    where ordered.day = (select max(active_days.day) from active_days) - (ordered.rn - 1)::integer
  )
  select
    case when max(latest_run.day) >= p_today - 1 then count(*)::integer else 0 end,
    case when max(latest_run.day) >= p_today - 1 then min(latest_run.day) end,
    max(latest_run.day)
  from latest_run;
$$;

revoke all on function private.quest_streak_for(uuid, date) from public, anon, authenticated;

-- 連続記録を取得する ----------------------------------------------------------------------
--
-- p_user_id を省略（NULL）すると自分の記録。同じ家族の人の記録も見られる（掲示板 #355 用）。
-- 子供でなければ、記録なし（0日）として返す。
--
-- pending_milestone は、まだお祝いしていないキリのいい日数のうち一番大きいもの（なければ NULL）。
-- 承認がまとめて来て一気に日数が増えたときは、間の日数を飛ばして一番大きい日数だけ祝う。
create or replace function public.get_quest_streak(p_user_id uuid default null)
returns table (
  current_days integer,
  started_on date,
  last_active_on date,
  pending_milestone integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  select users.role into v_role
  from public.users
  where users.id = v_target
    and (users.id = auth.uid() or users.family_id = public.current_user_family_id());

  if not found then
    raise exception '同じ家族の人の記録しか見られません';
  end if;

  if v_role <> 'child' then
    return query select 0, null::date, null::date, null::integer;
    return;
  end if;

  return query
  select
    streak.current_days,
    streak.started_on,
    streak.last_active_on,
    (
      select max(candidate.days)::integer
      from generate_series(
        coalesce((
          select max(celebrations.milestone_days)
          from public.quest_streak_celebrations as celebrations
          where celebrations.user_id = v_target
            -- 「=」ではなく「>=」にする。後から承認が来て途切れていた日が埋まると、
            -- 2つの記録が1つにつながり、始まった日が前へずれる。つながる前の後ろ側の記録で
            -- 祝った日数を、もう一度祝わないようにするため。
            and celebrations.streak_started_on >= streak.started_on
        ), 0) + 1,
        streak.current_days
      ) as candidate(days)
      where private.is_quest_streak_milestone(candidate.days)
    )
  from private.quest_streak_for(v_target, (now() at time zone 'Asia/Tokyo')::date) as streak;
end;
$$;

revoke all on function public.get_quest_streak(uuid) from public, anon;
grant execute on function public.get_quest_streak(uuid) to authenticated;

-- お祝いを出したことを記録する --------------------------------------------------------------
--
-- 子供本人だけが呼べる。届いていない日数・キリのよくない日数は拒否する。
-- 同じ記録・同じ日数をもう一度記録しようとしても何もしない（通信の再送で二重にならないように）。
-- 戻り値は、今回あらたに記録したかどうか。
create or replace function public.record_quest_streak_celebration(p_milestone_days integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_days integer;
  v_started_on date;
  v_inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  if not exists (
    select 1 from public.users where users.id = auth.uid() and users.role = 'child'
  ) then
    raise exception '連続記録は子供だけがつけられます';
  end if;

  if p_milestone_days is null or not private.is_quest_streak_milestone(p_milestone_days) then
    raise exception 'キリのいい日数ではありません';
  end if;

  select streak.current_days, streak.started_on
  into v_current_days, v_started_on
  from private.quest_streak_for(auth.uid(), (now() at time zone 'Asia/Tokyo')::date) as streak;

  if v_current_days < p_milestone_days then
    raise exception 'まだその日数に届いていません';
  end if;

  insert into public.quest_streak_celebrations (user_id, streak_started_on, milestone_days)
  values (auth.uid(), v_started_on, p_milestone_days)
  on conflict on constraint quest_streak_celebrations_user_streak_milestone_key do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count > 0;
end;
$$;

revoke all on function public.record_quest_streak_celebration(integer) from public, anon;
grant execute on function public.record_quest_streak_celebration(integer) to authenticated;
