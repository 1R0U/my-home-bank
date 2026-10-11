-- Issue #355: 大人の連続記録として、アプリを開いた日を記録する ----------------------------
--
-- 【大人の「1日続けた」の条件】
-- 子供は「承認されたタスクがある日」で数える（#372）。大人は自分でタスクをこなさないので、
-- **アプリを開いた日**（ログインした状態で開いた日。日本時間で区切る）を「続けた日」とする。
-- 開いた日は、この仕組みを入れた日から記録し始める。それより前の分はない（0日から数え始める）。
--
-- 【連続日数の数え方】
-- 子供と同じ（private.quest_streak_for と同じ考え方）。最後に開いた日が今日か昨日なら続いていて、
-- それより前なら0日。
--
-- 【お祝い】
-- 大人には出さない。掲示板で記録を見られるようにするだけ。
-- そのため get_quest_streak は大人に対して pending_milestone を常に NULL で返し、
-- record_quest_streak_celebration も今までどおり子供だけが呼べる。
--
-- 【記録するのは大人だけ】
-- 子供の記録はタスクの承認で数えるので、子供が開いた日は残さない（使わない記録を溜めない）。

create table if not exists public.app_open_days (
  user_id uuid not null references public.users (id) on delete cascade,
  opened_on date not null,
  created_at timestamptz not null default now(),

  constraint app_open_days_pkey primary key (user_id, opened_on)
);

alter table public.app_open_days enable row level security;

create policy app_open_days_select_self on public.app_open_days
for select to authenticated using (user_id = auth.uid());

revoke all on table public.app_open_days from anon, authenticated;
-- 読むだけを許可する。記録するのは下の record_app_open 経由に限る
-- （過去の日付を書き込んで、開いていない日の記録を作れないようにするため）。
grant select on table public.app_open_days to authenticated;

-- アプリを開いたことを記録する ----------------------------------------------------------
--
-- 日付はDBの時計（日本時間）で決める。端末の時計は使わない。
-- 同じ日に何度呼んでも1日分にしかならない。子供が呼んでも何もしない。
-- 戻り値は、今回あらたに記録したかどうか。
create or replace function public.record_app_open()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  if not exists (
    select 1 from public.users where users.id = auth.uid() and users.role = 'parent'
  ) then
    return false;
  end if;

  insert into public.app_open_days (user_id, opened_on)
  values (auth.uid(), (now() at time zone 'Asia/Tokyo')::date)
  on conflict on constraint app_open_days_pkey do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count > 0;
end;
$$;

revoke all on function public.record_app_open() from public, anon;
grant execute on function public.record_app_open() to authenticated;

-- 大人の連続記録を数える（権限の確認はしない。呼び出し元で確認すること） ------------------
--
-- 戻り値は private.quest_streak_for と同じ形で、必ず1行。
create or replace function private.app_open_streak_for(p_user_id uuid, p_today date)
returns table (current_days integer, started_on date, last_active_on date)
language sql
stable
security definer
set search_path = ''
as $$
  with active_days as (
    select app_open_days.opened_on as day
    from public.app_open_days
    where app_open_days.user_id = p_user_id
      and app_open_days.opened_on <= p_today
  ),
  ordered as (
    select active_days.day, row_number() over (order by active_days.day desc) as rn
    from active_days
  ),
  -- 新しい順に並べたとき、最後に開いた日から rn - 1 日前と一致する間は途切れていない
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

revoke all on function private.app_open_streak_for(uuid, date) from public, anon, authenticated;

-- 連続記録を取得する（大人の記録を足す） ---------------------------------------------------
--
-- 子供の分は 20261010030405_create_quest_streak_celebrations.sql から変えていない。
-- 大人はアプリを開いた日で数え、お祝いは出さないので pending_milestone は常に NULL。
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
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
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

  if v_role = 'parent' then
    return query
    select streak.current_days, streak.started_on, streak.last_active_on, null::integer
    from private.app_open_streak_for(v_target, v_today) as streak;
    return;
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
  from private.quest_streak_for(v_target, v_today) as streak;
end;
$$;

revoke all on function public.get_quest_streak(uuid) from public, anon;
grant execute on function public.get_quest_streak(uuid) to authenticated;
