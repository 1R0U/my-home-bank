-- Issue #263: クエストの設定元と、期間・対象の子ごとの実施を分ける。
-- 設定元は最初の実施自身。同じ行をリセットせず、申請と報酬額の履歴を残す。
alter table public.quests
  add column recurrence_source_id uuid references public.quests(id),
  add column period_starts_at timestamptz,
  add column period_ends_at timestamptz,
  add column audience text not null default 'first',
  add column target_child_id uuid references public.users(id),
  add column week_start_day integer,
  add column daily_end_minutes integer;

alter table public.quests
  add constraint quests_audience_check check (audience in ('first', 'specific', 'all')),
  add constraint quests_week_start_check check (week_start_day is null or (category = 'weekly' and week_start_day between 0 and 6)),
  add constraint quests_daily_end_check check (daily_end_minutes is null or (category = 'daily' and daily_end_minutes between 0 and 1439)),
  add constraint quests_period_check check (
    (period_starts_at is null and period_ends_at is null)
    or (category in ('daily', 'weekly') and period_starts_at is not null and period_ends_at is not null
      and isfinite(period_starts_at) and isfinite(period_ends_at) and period_starts_at < period_ends_at)
  );

create unique index quests_period_target_unique
  on public.quests (recurrence_source_id, period_starts_at, target_child_id) nulls not distinct
  where recurrence_source_id is not null;

create function private.quest_period(p_category text, p_week_start_day integer, p_now timestamptz, p_daily_end_minutes integer default 0)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable set search_path = '' as $$
declare v_start timestamp;
begin
  if p_category = 'limited' then return; end if;
  if p_now is null or not isfinite(p_now) then raise exception 'クエストの期間を計算する日時が不正です'; end if;
  if p_category not in ('daily', 'weekly') then raise exception 'クエストの区分が不正です'; end if;
  if p_category = 'weekly' and (p_week_start_day is null or p_week_start_day not between 0 and 6) then
    raise exception 'ウィークリーの開始曜日を指定してください';
  end if;
  v_start := date_trunc('day', p_now at time zone 'Asia/Tokyo');
  if p_category = 'daily' then
    if p_daily_end_minutes is null or p_daily_end_minutes not between 0 and 1439 then
      raise exception 'デイリーの終了時刻を指定してください';
    end if;
    v_start := v_start + p_daily_end_minutes * interval '1 minute';
    if v_start > p_now at time zone 'Asia/Tokyo' then v_start := v_start - interval '1 day'; end if;
  elsif p_category = 'weekly' then
    v_start := v_start - ((extract(dow from v_start)::integer - p_week_start_day + 7) % 7) * interval '1 day';
  end if;
  return query select v_start at time zone 'Asia/Tokyo',
    (v_start + case when p_category = 'weekly' then interval '7 days' else interval '1 day' end) at time zone 'Asia/Tokyo';
end; $$;

-- 古いクライアントからの直接INSERTも、従来の先着1人として繰り返しへ移行する。
create function private.prepare_quest_period()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recurrence_source_id is null and new.category in ('daily', 'weekly') then
    new.recurrence_source_id := new.id;
    new.week_start_day := case when new.category = 'weekly' then coalesce(new.week_start_day, 1) else null end;
    new.daily_end_minutes := case when new.category = 'daily' then coalesce(new.daily_end_minutes, 0) else null end;
    select starts_at, ends_at into new.period_starts_at, new.period_ends_at
      from private.quest_period(new.category, new.week_start_day, clock_timestamp(), coalesce(new.daily_end_minutes, 0));
  end if;
  return new;
end; $$;
create trigger prepare_quest_period_before_insert before insert on public.quests
  for each row execute function private.prepare_quest_period();

-- 未受注・受注中は期間の終了日時ちょうどに受付終了する。承認・却下は妨げない。
create function private.guard_quest_period_and_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status in ('accepted', 'pending') then
    if old.period_ends_at is not null and old.period_ends_at <= clock_timestamp() then
      raise exception '期間が終了したタスクは受注・完了申請できません';
    end if;
    if old.audience <> 'first' and new.assigned_to is distinct from old.target_child_id then
      raise exception 'このタスクは指定された子だけが受注できます';
    end if;
  end if;
  return new;
end; $$;
create trigger guard_quest_period_and_target_before_update before update of status on public.quests
  for each row execute function private.guard_quest_period_and_target();

-- 同じ家庭の同期を直列化し、期間の切替・複数端末での取得でも実施を重複作成しない。
-- 引数の時計はSQLテスト用。外部には実時計を使うpublic版だけを公開する。
create function private.sync_quest_periods(p_family_id uuid, p_now timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_source public.quests;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('quest-periods:' || p_family_id::text, 0));
  for v_source in select * from public.quests
    where family_id = p_family_id and recurrence_source_id = id and category in ('daily', 'weekly')
    order by id
  loop
    select starts_at, ends_at into v_start, v_end
      from private.quest_period(v_source.category, v_source.week_start_day, p_now, coalesce(v_source.daily_end_minutes, 0));
    -- 過去の期間を埋めず、今回取得された日時を含む分だけ作る。
    insert into public.quests (family_id, title, description, reward_amount, category, is_required, created_by,
      recurrence_source_id, period_starts_at, period_ends_at, audience, target_child_id, week_start_day, daily_end_minutes)
    select v_source.family_id, v_source.title, v_source.description, v_source.reward_amount,
      v_source.category, v_source.is_required, v_source.created_by, v_source.id, v_start, v_end,
      v_source.audience, eligible.id, v_source.week_start_day, v_source.daily_end_minutes
    from (
      select null::uuid as id where v_source.audience = 'first'
      union all
      select u.id from public.users u where u.family_id = p_family_id and u.role = 'child'
        and (v_source.audience = 'all' or (v_source.audience = 'specific' and u.id = v_source.target_child_id))
    ) eligible
    on conflict (recurrence_source_id, period_starts_at, target_child_id)
      where recurrence_source_id is not null do nothing;
  end loop;
end; $$;

create function public.sync_quest_periods(p_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_child_session();
  if auth.uid() is null or p_family_id is distinct from public.current_user_family_id() then
    raise exception '同じ家庭のクエストだけ更新できます';
  end if;
  perform private.sync_quest_periods(p_family_id, clock_timestamp());
end; $$;

-- 表示対象の判断もDBの実時計に統一する。過去の承認待ちは現在の実施と併せて取得する。
create function public.get_quests(p_family_id uuid)
returns setof public.quests language plpgsql security invoker set search_path = '' as $$
begin
  perform public.check_child_session();
  if auth.uid() is null or p_family_id is distinct from public.current_user_family_id() then
    raise exception '同じ家庭のクエストだけ取得できます';
  end if;
  return query select * from public.quests where family_id = p_family_id
    and (period_ends_at is null or period_ends_at > clock_timestamp() or status = 'pending')
    order by created_at desc, id;
end; $$;

create function public.create_quest(
  p_family_id uuid, p_title text, p_description text, p_reward_amount bigint,
  p_category text, p_is_required boolean, p_audience text, p_target_child_id uuid,
  p_week_start_day integer, p_expires_at timestamptz, p_daily_end_minutes integer default 0
)
returns public.quests language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_target uuid;
  v_result public.quests;
begin
  perform public.check_child_session();
  if not exists (select 1 from public.users where id = auth.uid() and role = 'parent' and family_id = p_family_id) then
    raise exception '同じ家庭の親だけがクエストを作成できます';
  end if;
  if p_title is null or btrim(p_title) = '' or p_reward_amount is null or p_reward_amount not between 1 and 9007199254740991 then
    raise exception 'タイトルと1以上の安全な整数の報酬を指定してください';
  end if;
  if p_category is null or p_category not in ('daily', 'weekly', 'limited')
    or p_audience is null or p_audience not in ('first', 'specific', 'all') then
    raise exception 'クエストの区分・担当が不正です';
  end if;
  if p_category = 'weekly' and (p_week_start_day is null or p_week_start_day not between 0 and 6) then
    raise exception 'ウィークリーの開始曜日を指定してください';
  end if;
  if p_category <> 'weekly' and p_week_start_day is not null then raise exception '開始曜日はウィークリーだけに設定できます'; end if;
  if p_category = 'daily' and (p_daily_end_minutes is null or p_daily_end_minutes not between 0 and 1439) then
    raise exception 'デイリーの終了時刻を指定してください';
  end if;
  if p_audience = 'specific' then
    select id into v_target from public.users where id = p_target_child_id and family_id = p_family_id and role = 'child';
    if v_target is null then raise exception '同じ家庭の子を指定してください'; end if;
  elsif p_target_child_id is not null then
    raise exception '担当する子は「特定の子」の場合だけ指定できます';
  elsif p_audience = 'all' then
    select id into v_target from public.users where family_id = p_family_id and role = 'child' order by created_at, id limit 1;
    if v_target is null then raise exception '担当する子がいません'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quest-periods:' || p_family_id::text, 0));
  -- expires_atの区分と有限性は共通のquests_limited_deadline_checkで検証する。
  insert into public.quests (id, family_id, title, description, reward_amount, category, is_required,
    created_by, audience, target_child_id, week_start_day, expires_at, daily_end_minutes, recurrence_source_id)
  values (v_id, p_family_id, btrim(p_title), coalesce(p_description, ''), p_reward_amount, p_category,
    coalesce(p_is_required, false), auth.uid(), p_audience, v_target, p_week_start_day, p_expires_at,
    case when p_category = 'daily' then p_daily_end_minutes else null end,
    case when p_category = 'limited' then v_id else null end)
  returning * into v_result;
  if p_category = 'limited' and p_audience = 'all' then
    insert into public.quests (family_id, title, description, reward_amount, category, is_required,
      created_by, audience, target_child_id, expires_at, recurrence_source_id)
    select p_family_id, v_result.title, v_result.description, p_reward_amount, 'limited', v_result.is_required,
      auth.uid(), 'all', id, p_expires_at, v_id from public.users
      where family_id = p_family_id and role = 'child' and id <> v_target;
  elsif p_category <> 'limited' then
    perform private.sync_quest_periods(p_family_id, clock_timestamp());
  end if;
  return v_result;
end; $$;

-- 全員向けの限定クエストは、担当ごとの進行は保ったまま同じ設定の期限をまとめて変更する。
create or replace function public.update_quest_deadline(p_quest_id uuid, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family_id uuid; v_source_id uuid;
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  perform public.check_child_session();
  select family_id into v_family_id from public.users where id = auth.uid() and role = 'parent';
  if v_family_id is null then raise exception '期限を変更できるのは親だけです'; end if;
  if p_expires_at is not null and not isfinite(p_expires_at) then raise exception '期限は実在する日時を指定してください'; end if;
  select recurrence_source_id into v_source_id from public.quests
    where id = p_quest_id and family_id = v_family_id and category = 'limited';
  if not found then raise exception '同じ家庭の限定タスクだけ期限を変更できます'; end if;
  update public.quests set expires_at = p_expires_at
    where family_id = v_family_id and category = 'limited'
      and (id = p_quest_id or recurrence_source_id = v_source_id);
end; $$;

revoke all on function private.quest_period(text,integer,timestamptz,integer) from public, anon, authenticated;
revoke all on function private.prepare_quest_period(), private.guard_quest_period_and_target(),
  private.sync_quest_periods(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.sync_quest_periods(uuid), public.get_quests(uuid),
  public.create_quest(uuid,text,text,bigint,text,boolean,text,uuid,integer,timestamptz,integer) from public, anon;
grant execute on function public.sync_quest_periods(uuid), public.get_quests(uuid),
  public.create_quest(uuid,text,text,bigint,text,boolean,text,uuid,integer,timestamptz,integer) to authenticated;

-- 旧タスクは終了済み・作り直しがあり得るため、曖昧な行を推測で繰り返しにしない。
-- tests/sql/quest_period_preflight.sqlで確認し、引き継ぐ対象を決めてから補完する。
create function private.check_quest_period_backfill()
returns void language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.quests
    where category in ('daily', 'weekly') and recurrence_source_id is null and status = 'completed') then
    raise exception '既存クエストの引き継ぎ対象が未確認です（完了済み）。適用前確認SQLの結果を確認してください';
  end if;
  if exists (select 1 from public.quests
    where category in ('daily', 'weekly') and (recurrence_source_id is null or recurrence_source_id = id)
    group by family_id, category, btrim(title)
    having count(*) > 1 and bool_or(recurrence_source_id is null)) then
    raise exception '既存クエストの引き継ぎ対象が未確認です（同名の行が複数）。適用前確認SQLの結果を確認してください';
  end if;
end; $$;
revoke all on function private.check_quest_period_backfill() from public, anon, authenticated;
