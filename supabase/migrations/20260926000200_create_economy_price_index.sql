-- Issue #161: 月次の流通HMC集計と物価指数を実装する
--
-- 設計:
--   ・物価指数は1家庭1か月につき1件。その月に最初に呼ばれたときに計算し、以降は同じ結果を返す
--   ・計算の基準時刻は「日本時間(UTC+9固定)の月初 0:00」。適正流通HMCはその直前30日間の
--     クエスト報酬で数えるため、月のどの時点で呼んでも同じ値になる
--   ・流通HMCは簡易版として、計算した時点の子どものお財布残高の合計を使う
--     (日々の残高を記録していないため前月平均にはできない。計算時刻を calculation_basis に残す)
--   ・2つのテーブルは anon / authenticated から権限を外し、RLSも有効にしてポリシーを作らない。
--     読み書きは get_or_create_monthly_price_index() 経由だけにする

-- 1. 家族ごとの経済設定(親が調整する値)
create table public.economy_settings (
  family_id uuid primary key references public.families(id) on delete restrict,
  -- 比率(流通HMC ÷ 適正流通HMC × 100)の境界値:
  -- deflation 未満はデフレ、stable 未満は安定、light_inflation 未満は軽いインフレ、それ以上は強いインフレ
  price_index_thresholds jsonb not null default '{"deflation": 75, "stable": 125, "light_inflation": 175}'::jsonb,
  target_months numeric not null default 2,
  updated_at timestamptz not null default now(),
  -- 0以下だと適正流通HMCが常に0になり、物価指数が黙って100に固定されるため
  constraint economy_settings_target_months_positive check (target_months > 0),
  -- キーが欠けると比較がすべてNULLになり、物価指数が黙って110に固定されるため
  constraint economy_settings_thresholds_valid check (
    price_index_thresholds ?& array['deflation', 'stable', 'light_inflation']
    and jsonb_typeof(price_index_thresholds->'deflation') = 'number'
    and jsonb_typeof(price_index_thresholds->'stable') = 'number'
    and jsonb_typeof(price_index_thresholds->'light_inflation') = 'number'
    and (price_index_thresholds->>'deflation')::numeric < (price_index_thresholds->>'stable')::numeric
    and (price_index_thresholds->>'stable')::numeric < (price_index_thresholds->>'light_inflation')::numeric
  )
);

comment on table public.economy_settings is
  'Issue #161: 家族ごとの物価指数しきい値・適正流通量の計算に使う月数';

-- 2. 月次スナップショット(計算結果の履歴)
create table public.economy_monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete restrict,
  snapshot_month date not null, -- 日本時間の暦での、その月の1日(例: 2026-09-01)
  avg_circulating_hmc numeric not null, -- 簡易版では計算時点のお財布残高の合計(前月平均ではない)
  target_hmc numeric not null,
  price_index int not null,
  calculation_basis jsonb not null, -- 画面表示用の計算根拠
  created_at timestamptz not null default now(),
  unique (family_id, snapshot_month)
);

comment on table public.economy_monthly_snapshots is
  'Issue #161: 月次で1回だけ作成される物価指数の計算結果。family_id, snapshot_month の組で一意';

-- 3. 直接の読み書きを禁止する
-- 権限を外したうえでRLSも有効にし、ポリシーを作らないことで防御を二重にする。
-- 読み取りは get_or_create_monthly_price_index() の戻り値で行う。
revoke all on table public.economy_settings from anon, authenticated;
revoke all on table public.economy_monthly_snapshots from anon, authenticated;
alter table public.economy_settings enable row level security;
alter table public.economy_monthly_snapshots enable row level security;

-- 4. 計算の中核を小さな関数に切り出す
-- tests/sql/price_index_assertions.sql で、月の境界・基準時刻・物価指数の境界値を直接検証するため。

-- 日時から、日本時間の暦での「その月の1日」を返す。
-- at time zone 'UTC' で一度タイムゾーンなしの時刻に直してから9時間足すため、
-- DBセッションのタイムゾーン設定に左右されない。
create function private.family_calendar_month(p_at timestamptz)
returns date
language sql
immutable
set search_path to ''
as $$
  select date_trunc('month', (p_at at time zone 'UTC') + interval '9 hours')::date;
$$;

-- 月(その月の1日)から、計算の基準時刻である「日本時間の月初 0:00」を返す。
create function private.family_month_start(p_month date)
returns timestamptz
language sql
immutable
set search_path to ''
as $$
  select (p_month::timestamp - interval '9 hours') at time zone 'UTC';
$$;

-- 流通HMCと適正流通HMCから物価指数(95/100/105/110)を返す。
-- 適正流通HMCが0以下(基準時刻の直前30日間に報酬がない)のときは判定できないため、安定(100)とする。
create function private.price_index_for(
  p_circulating numeric,
  p_target numeric,
  p_thresholds jsonb
)
returns int
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_ratio numeric;
begin
  if p_target is null or p_target <= 0 then
    return 100;
  end if;

  v_ratio := p_circulating / p_target * 100;

  if v_ratio < (p_thresholds->>'deflation')::numeric then
    return 95;
  elsif v_ratio < (p_thresholds->>'stable')::numeric then
    return 100;
  elsif v_ratio < (p_thresholds->>'light_inflation')::numeric then
    return 105;
  else
    return 110;
  end if;
end;
$$;

revoke all on function private.family_calendar_month(timestamptz) from public;
revoke all on function private.family_month_start(date) from public;
revoke all on function private.price_index_for(numeric, numeric, jsonb) from public;

-- 5. その月の物価指数を返すRPC(無ければ作る)
-- 呼び出し元(auth.uid())が所属する家族に対してのみ実行できる。family_id を引数で受け取らないことで、
-- 他家族の family_id を渡されて計算されることを構造的に防ぐ。
create function public.get_or_create_monthly_price_index()
returns public.economy_monthly_snapshots
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_family_id uuid;
  v_month date := private.family_calendar_month(now());
  v_base timestamptz;
  v_existing public.economy_monthly_snapshots%rowtype;
  v_thresholds jsonb;
  v_target_months numeric;
  v_circulating numeric;
  v_child_count int;
  v_reward_total numeric;
  v_target numeric;
  v_price_index int;
begin
  select users.family_id
  into v_family_id
  from public.users as users
  where users.id = auth.uid();

  if v_family_id is null then
    raise exception '家族に所属していません';
  end if;

  -- 既にこの月の結果があれば、それをそのまま返す(再実行しても作り直さない)
  select *
  into v_existing
  from public.economy_monthly_snapshots
  where family_id = v_family_id and snapshot_month = v_month;

  if found then
    return v_existing;
  end if;

  -- 計算の基準時刻: 日本時間の月初 0:00
  v_base := private.family_month_start(v_month);

  -- 家族の経済設定。まだ無ければデフォルト値で作る(同時実行でも衝突しないよう on conflict で吸収する)
  insert into public.economy_settings (family_id)
  values (v_family_id)
  on conflict (family_id) do nothing;

  select price_index_thresholds, target_months
  into v_thresholds, v_target_months
  from public.economy_settings
  where family_id = v_family_id;

  -- 流通HMC: 子どものお財布残高の合計(簡易版: 計算時点の残高)
  select coalesce(sum(users.balance), 0), count(*)
  into v_circulating, v_child_count
  from public.users as users
  where users.family_id = v_family_id and users.role = 'child';

  -- 適正流通HMC: 基準時刻の直前30日間に子どもが受け取ったクエスト報酬の合計 × target_months
  -- その月に入ってからの報酬は数えないため、月のどの時点で呼んでも同じ値になる
  select coalesce(sum(transactions.amount), 0)
  into v_reward_total
  from public.transactions as transactions
  join public.users as users on users.id = transactions.user_id
  where users.family_id = v_family_id
    and users.role = 'child'
    and transactions.type = 'quest_reward'
    and transactions.created_at >= v_base - interval '30 days'
    and transactions.created_at < v_base;

  v_target := v_reward_total * v_target_months;
  v_price_index := private.price_index_for(v_circulating, v_target, v_thresholds);

  insert into public.economy_monthly_snapshots (
    family_id, snapshot_month, avg_circulating_hmc, target_hmc, price_index, calculation_basis
  )
  values (
    v_family_id, v_month, v_circulating, v_target, v_price_index,
    jsonb_build_object(
      'calculated_at', now(),
      'child_count', v_child_count,
      'quest_reward_total_30d', v_reward_total,
      'reward_window_start', v_base - interval '30 days',
      'reward_window_end', v_base,
      'target_months', v_target_months,
      'thresholds', v_thresholds,
      'circulating_basis', '計算時点のお財布残高（簡易版。前月平均ではない）'
    )
  )
  on conflict (family_id, snapshot_month) do nothing
  returning * into v_existing;

  -- 同時実行で他方が先に作った場合は returning が空になるので、作られた行を読み直す
  if v_existing.id is null then
    select *
    into v_existing
    from public.economy_monthly_snapshots
    where family_id = v_family_id and snapshot_month = v_month;
  end if;

  return v_existing;
end;
$function$;

revoke all on function public.get_or_create_monthly_price_index() from public, anon;
grant execute on function public.get_or_create_monthly_price_index() to authenticated;

comment on function public.get_or_create_monthly_price_index() is
  'Issue #161: 呼び出し元の家族の今月の物価指数を返す。その月に初めて呼ばれたときだけ計算して保存し、以降は保存済みの結果を返す';
