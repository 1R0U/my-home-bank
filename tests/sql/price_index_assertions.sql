-- Issue #161: 月次の物価指数（get_or_create_monthly_price_index）の動作を検証する ---
--
-- supabase/migrations/*.sql をすべて適用した直後の空のDBに対して実行する。
-- 失敗した時点で exception を投げ、CIのジョブを落とす。
-- tests/sql/store_assertions.sql と同じ方針（pg_temp.assert ヘルパーを使った実行テスト）。
--
-- Issue #161 の完了条件との対応:
--   1. 日付     → 月の境界と基準時刻（日本時間の月初 0:00）、セッションのタイムゾーンに依存しないこと
--   2. 境界値   → 物価指数の 74/75、124/125、174/175
--   3. 集計     → 子どものお財布と、基準時刻の直前30日間のクエスト報酬だけが数えられる
--   4. 再実行   → 同じ月にもう一度呼んでも同じ結果が返り、行が増えない
--   5. ゼロ件   → 子どもも報酬もない家族では物価指数100になる
--   6. 設定     → 経済設定の check 制約と、外部キーの on delete restrict
--   7. 認可     → 家族に属さない利用者は拒否され、anon / authenticated はテーブルを直接触れない

\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void
language plpgsql
as $$
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

create function pg_temp.assert_rejected_with(
  p_sql text,
  p_expected text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_message text;
  v_sqlstate text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics
      v_message = message_text,
      v_sqlstate = returned_sqlstate;
    if v_sqlstate <> 'P0001' or v_message is distinct from p_expected then
      raise exception '想定外のエラー（%）: [%] %', p_label, v_sqlstate, v_message;
    end if;
    raise notice 'OK  %（想定した理由で拒否された）', p_label;
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

\echo '=== 1. 日本時間の暦で月と基準時刻が決まる ==='

do $$
begin
  perform pg_temp.assert(
    private.family_calendar_month('2026-09-30 14:59:59+00') = date '2026-09-01',
    '日本時間 9/30 23:59:59 は9月');
  perform pg_temp.assert(
    private.family_calendar_month('2026-09-30 15:00:00+00') = date '2026-10-01',
    '日本時間 10/1 0:00 は10月（UTCではまだ9/30）');
  perform pg_temp.assert(
    private.family_calendar_month('2026-12-31 15:00:00+00') = date '2027-01-01',
    '日本時間の元日 0:00 は翌年1月');
  perform pg_temp.assert(
    private.family_month_start(date '2026-10-01') = timestamptz '2026-09-30 15:00:00+00',
    '10月の基準時刻は日本時間 10/1 0:00（UTC 9/30 15:00）');
  perform pg_temp.assert(
    private.family_month_start(date '2027-01-01') = timestamptz '2026-12-31 15:00:00+00',
    '1月の基準時刻は日本時間の元日 0:00（UTC 12/31 15:00）');
end;
$$;

do $$
begin
  -- Supabase の既定は UTC だが、それに依存していないことを確かめる
  perform set_config('TimeZone', 'America/Los_Angeles', true);
  perform pg_temp.assert(
    private.family_calendar_month('2026-09-30 15:00:00+00') = date '2026-10-01',
    'セッションのタイムゾーンが America/Los_Angeles でも日本時間の10月になる');
  perform pg_temp.assert(
    private.family_month_start(date '2026-10-01') = timestamptz '2026-09-30 15:00:00+00',
    'セッションのタイムゾーンが America/Los_Angeles でも基準時刻は変わらない');
end;
$$;

\echo '=== 2. 比率の境界ごとに正しい物価指数が選ばれる ==='

do $$
declare
  v_thresholds jsonb := '{"deflation": 75, "stable": 125, "light_inflation": 175}';
begin
  perform pg_temp.assert(private.price_index_for(0, 100, v_thresholds) = 95, '0% はデフレ(95)');
  perform pg_temp.assert(private.price_index_for(74, 100, v_thresholds) = 95, '74% はデフレ(95)');
  perform pg_temp.assert(private.price_index_for(75, 100, v_thresholds) = 100, '75% は安定(100)');
  perform pg_temp.assert(private.price_index_for(124, 100, v_thresholds) = 100, '124% は安定(100)');
  perform pg_temp.assert(private.price_index_for(125, 100, v_thresholds) = 105, '125% は軽いインフレ(105)');
  perform pg_temp.assert(private.price_index_for(174, 100, v_thresholds) = 105, '174% は軽いインフレ(105)');
  perform pg_temp.assert(private.price_index_for(175, 100, v_thresholds) = 110, '175% は強いインフレ(110)');
  perform pg_temp.assert(private.price_index_for(1000, 100, v_thresholds) = 110, '1000% は強いインフレ(110)');
  perform pg_temp.assert(private.price_index_for(500, 0, v_thresholds) = 100, '適正量0は判定できないため安定(100)');
  perform pg_temp.assert(private.price_index_for(500, null, v_thresholds) = 100, '適正量NULLは判定できないため安定(100)');
end;
$$;

\echo '=== 検証用の家族を用意する ==='

insert into public.users (id, name, role, balance) values
  ('16100000-0000-0000-0000-00000000000a', '物価検証用の親A', 'parent', 0),
  ('16100000-0000-0000-0000-00000000000b', '物価検証用の親B', 'parent', 0),
  ('16100000-0000-0000-0000-00000000000c', '家族に属さない親', 'parent', 0),
  ('16100000-0000-0000-0000-0000000000a1', '物価検証用の子A1', 'child', 500),
  ('16100000-0000-0000-0000-0000000000a2', '物価検証用の子A2', 'child', 0);

do $$
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  perform public.create_family_with_treasury('物価検証用の家族A', 10000, 'price-index-test-family-a');

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000b', true);
  perform public.create_family_with_treasury('物価検証用の家族B', 10000, 'price-index-test-family-b');
end;
$$;

update public.users
set family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a')
where id in ('16100000-0000-0000-0000-0000000000a1', '16100000-0000-0000-0000-0000000000a2');

-- 親のお財布は流通ゴルに含まれないことを確かめるため、あえて残高を持たせる
update public.users set balance = 777 where id = '16100000-0000-0000-0000-00000000000a';

-- 前月に子どもの合計500が続いていた完全な記録を、検証用に用意する。
-- 実環境のマイグレーションはこのように過去へ遡って補完しない。
update public.wallet_circulation_tracking
set known_from = private.family_month_start((private.family_calendar_month(now()) - interval '1 month')::date)
where family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a');
delete from public.wallet_circulation_changes
where family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a');
insert into public.wallet_circulation_changes(family_id, amount, recorded_at)
select family_id, 500, private.family_month_start((private.family_calendar_month(now()) - interval '1 month')::date)
from public.users where id = '16100000-0000-0000-0000-00000000000a';

\echo '=== 新旧スナップショット列の同期トリガーが実際に動く ==='

-- 旧列だけを指定したINSERTでは、正式なgol列へ値を補完する。
insert into public.economy_monthly_snapshots (
  family_id, snapshot_month, avg_circulating_hmc, target_hmc, price_index, calculation_basis
)
select family_id, date '2100-01-01', 10, 20, 100, '{}'::jsonb
from public.users where id = '16100000-0000-0000-0000-00000000000a';

select pg_temp.assert(
  exists (
    select 1
    from public.economy_monthly_snapshots
    where family_id = (
      select family_id from public.users
      where id = '16100000-0000-0000-0000-00000000000a'
    )
      and snapshot_month = date '2100-01-01'
      and avg_circulating_gol = 10
      and target_gol = 20
  ),
  '旧hmc列だけのINSERTでgol列が同期される');

-- gol列だけを指定したINSERTでは、互換用の旧列へ値を補完する。
insert into public.economy_monthly_snapshots (
  family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis
)
select family_id, date '2100-02-01', 30, 40, 100, '{}'::jsonb
from public.users where id = '16100000-0000-0000-0000-00000000000a';

select pg_temp.assert(
  exists (
    select 1
    from public.economy_monthly_snapshots
    where family_id = (
      select family_id from public.users
      where id = '16100000-0000-0000-0000-00000000000a'
    )
      and snapshot_month = date '2100-02-01'
      and avg_circulating_hmc = 30
      and target_hmc = 40
  ),
  'gol列だけのINSERTで旧hmc列が同期される');

select pg_temp.assert_rejected_with(
  $sql$
    insert into public.economy_monthly_snapshots (
      family_id, snapshot_month,
      avg_circulating_hmc, target_hmc, avg_circulating_gol, target_gol,
      price_index, calculation_basis
    )
    select family_id, date '2100-03-01', 50, 60, 51, 61, 100, '{}'::jsonb
    from public.users where id = '16100000-0000-0000-0000-00000000000a'
  $sql$,
  '流通ゴルの新旧列に異なる値は指定できません',
  '新旧列に異なる値を指定するINSERT');

-- 旧列だけを更新した場合はgol列へ、gol列だけなら旧列へ反映する。
update public.economy_monthly_snapshots
set avg_circulating_hmc = 11, target_hmc = 21
where snapshot_month = date '2100-01-01';

select pg_temp.assert(
  exists (
    select 1
    from public.economy_monthly_snapshots
    where family_id = (
      select family_id from public.users
      where id = '16100000-0000-0000-0000-00000000000a'
    )
      and snapshot_month = date '2100-01-01'
      and avg_circulating_gol = 11
      and target_gol = 21
  ),
  '旧hmc列だけのUPDATEでgol列が同期される');

update public.economy_monthly_snapshots
set avg_circulating_gol = 31, target_gol = 41
where snapshot_month = date '2100-02-01';

select pg_temp.assert(
  exists (
    select 1
    from public.economy_monthly_snapshots
    where family_id = (
      select family_id from public.users
      where id = '16100000-0000-0000-0000-00000000000a'
    )
      and snapshot_month = date '2100-02-01'
      and avg_circulating_hmc = 31
      and target_hmc = 41
  ),
  'gol列だけのUPDATEで旧hmc列が同期される');

select pg_temp.assert_rejected_with(
  $sql$
    update public.economy_monthly_snapshots
    set avg_circulating_hmc = 70, avg_circulating_gol = 71
    where snapshot_month = date '2100-01-01'
  $sql$,
  '流通ゴルの新旧列に異なる値は指定できません',
  '新旧列を異なる値にするUPDATE');

delete from public.economy_monthly_snapshots
where snapshot_month in (date '2100-01-01', date '2100-02-01');

-- 報酬は「今月の基準時刻（日本時間の月初 0:00）」からの相対時刻で入れる
insert into public.transactions (user_id, type, description, amount, created_at)
select v.user_id, v.type, v.description, v.amount, v.created_at
from (select private.family_month_start(private.family_calendar_month(now())) as base) as b
cross join lateral (values
  ('16100000-0000-0000-0000-0000000000a1'::uuid, 'quest_reward', '月初の前日の報酬（対象）', 1000, b.base - interval '1 day'),
  ('16100000-0000-0000-0000-0000000000a1'::uuid, 'quest_reward', 'ちょうど30日前の報酬（期間の始まり・対象）', 500, b.base - interval '30 days'),
  ('16100000-0000-0000-0000-0000000000a2'::uuid, 'quest_reward', '30日と1秒前の報酬（対象外）', 5000, b.base - interval '30 days' - interval '1 second'),
  ('16100000-0000-0000-0000-0000000000a1'::uuid, 'quest_reward', '今月に入ってからの報酬（対象外）', 700, b.base),
  ('16100000-0000-0000-0000-0000000000a1'::uuid, 'store_purchase', 'クエスト報酬以外（対象外）', -300, b.base - interval '1 day')
) as v(user_id, type, description, amount, created_at);

\echo '=== 3. 子どものお財布と、基準時刻の直前30日間の報酬だけで計算される ==='

do $$
declare
  v_snapshot public.economy_monthly_snapshots;
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_snapshot := public.get_or_create_monthly_price_index();

  perform pg_temp.assert(
    v_snapshot.avg_circulating_gol = 500,
    format('前月のWallet平均は500で、親の777と個人履歴を重複して数えない（実際: %s）', v_snapshot.avg_circulating_gol));
  perform pg_temp.assert(
    (v_snapshot.calculation_basis->>'quest_reward_total_30d')::numeric = 1500,
    format('報酬は直前30日間の1000+500だけ。30日より前・今月・購入は含まない（実際: %s）',
           v_snapshot.calculation_basis->>'quest_reward_total_30d'));
  perform pg_temp.assert(
    v_snapshot.target_gol = 3000,
    format('適正流通ゴルは報酬1500×2か月（実際: %s）', v_snapshot.target_gol));
  perform pg_temp.assert(
    v_snapshot.avg_circulating_hmc = v_snapshot.avg_circulating_gol
      and v_snapshot.target_hmc = v_snapshot.target_gol,
    '旧hmc列は移行期間中もgol列と同じ値を返す');
  perform pg_temp.assert(
    v_snapshot.price_index = 95,
    format('500÷3000≒17%% でデフレ(95)（実際: %s）', v_snapshot.price_index));
  perform pg_temp.assert(
    v_snapshot.snapshot_month = private.family_calendar_month(now()),
    '日本時間の今月として記録される');
  perform pg_temp.assert(
    (v_snapshot.calculation_basis->>'reward_window_end')::timestamptz
      = private.family_month_start(v_snapshot.snapshot_month),
    '計算根拠の集計期間の終わりが、日本時間の月初 0:00 になっている');
  perform pg_temp.assert(
    v_snapshot.calculation_basis ? 'calculated_at',
    '計算根拠に計算時刻が残る');
  perform pg_temp.assert(
    (v_snapshot.calculation_basis->>'circulating_history_complete')::boolean
      and (v_snapshot.calculation_basis->>'circulating_window_start')::timestamptz
        = private.family_month_start((v_snapshot.snapshot_month - interval '1 month')::date)
      and (v_snapshot.calculation_basis->>'circulating_window_end')::timestamptz
        = private.family_month_start(v_snapshot.snapshot_month),
    '流通量の集計期間は日本時間の前月全体で、履歴が完全と記録される');
  perform pg_temp.assert(
    (v_snapshot.calculation_basis->>'child_count')::int = 2,
    '計算根拠に子どもの人数(2)が残る');
end;
$$;

\echo '=== 4. 同じ月に再実行しても結果が変わらず、行も増えない ==='

-- 残高を大きく変えても、今月の結果は書き換わらないことを確かめる
update public.users set balance = 5000 where id = '16100000-0000-0000-0000-0000000000a1';

do $$
declare
  v_family_id uuid;
  v_first_id uuid;
  v_second public.economy_monthly_snapshots;
  v_count int;
begin
  select family_id into v_family_id
  from public.users where id = '16100000-0000-0000-0000-00000000000a';

  select id into v_first_id
  from public.economy_monthly_snapshots where family_id = v_family_id;

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_second := public.get_or_create_monthly_price_index();

  perform pg_temp.assert(v_second.id = v_first_id, '同じ月の再実行は既存の結果を返す');
  perform pg_temp.assert(
    v_second.price_index = 95,
    format('再実行しても物価指数は95のまま（実際: %s）', v_second.price_index));

  select count(*) into v_count
  from public.economy_monthly_snapshots where family_id = v_family_id;
  perform pg_temp.assert(v_count = 1, format('同じ家族・同じ月の行は1件のまま（実際: %s件）', v_count));
end;
$$;

\echo '=== 5. 子どもも報酬もない家族では物価指数100になる ==='

do $$
declare
  v_snapshot public.economy_monthly_snapshots;
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000b', true);
  v_snapshot := public.get_or_create_monthly_price_index();

  perform pg_temp.assert(
    v_snapshot.price_index = 100 and v_snapshot.target_gol = 0 and v_snapshot.avg_circulating_gol = 0,
    format('流通0・適正0で安定(100)（実際: 物価%s、適正%s、流通%s）',
           v_snapshot.price_index, v_snapshot.target_gol, v_snapshot.avg_circulating_gol));
end;
$$;

\echo '=== 6. 経済設定の制約と外部キー ==='

select pg_temp.assert_rejected(
  $sql$
    update public.economy_settings set target_months = 0
    where family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a')
  $sql$,
  '適正流通量の月数を0にする');

select pg_temp.assert_rejected(
  $sql$
    update public.economy_settings set price_index_thresholds = '{"deflation": 75, "stable": 125}'
    where family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a')
  $sql$,
  'しきい値のキーが欠けている');

select pg_temp.assert_rejected(
  $sql$
    update public.economy_settings set price_index_thresholds = '{"deflation": 125, "stable": 75, "light_inflation": 175}'
    where family_id = (select family_id from public.users where id = '16100000-0000-0000-0000-00000000000a')
  $sql$,
  'しきい値の大小が逆になっている');

do $$
declare
  v_total int;
  v_restrict int;
begin
  select count(*), count(*) filter (where confdeltype = 'r')
  into v_total, v_restrict
  from pg_constraint
  where contype = 'f'
    and conrelid in ('public.economy_settings'::regclass, 'public.economy_monthly_snapshots'::regclass);

  perform pg_temp.assert(
    v_total = 2 and v_restrict = 2,
    format('2つの外部キーがどちらも on delete restrict（実際: %s件中%s件）', v_total, v_restrict));
end;
$$;

\echo '=== 7. 認可 ==='

select pg_temp.assert_rejected(
  format($sql$
    do $inner$
    begin
      perform set_config('request.jwt.claim.sub', %L, true);
      perform public.get_or_create_monthly_price_index();
    end;
    $inner$
  $sql$, '16100000-0000-0000-0000-00000000000c'),
  '家族に属さない利用者による呼び出し');

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.get_or_create_monthly_price_index()', 'execute'),
    'anon はRPCを実行できない');
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.get_or_create_monthly_price_index()', 'execute'),
    'authenticated はRPCを実行できる');
  perform pg_temp.assert(
    not has_table_privilege('anon', 'public.economy_monthly_snapshots', 'select'),
    'anon はスナップショットを直接読めない');
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.economy_monthly_snapshots', 'select'),
    'authenticated はスナップショットを直接読めない');
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.economy_monthly_snapshots', 'insert'),
    'authenticated はスナップショットを直接作れない');
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.economy_settings', 'update'),
    'authenticated は経済設定を直接変更できない');
end;
$$;

\echo '=== 8. 親用ダッシュボードは今月・前月だけを返し、子どもを拒否する ==='

insert into public.economy_monthly_snapshots (
  family_id, snapshot_month,
  avg_circulating_gol, target_gol,
  price_index, calculation_basis
)
select
  users.family_id,
  (private.family_calendar_month(now()) - interval '1 month')::date,
  400, 3000, 100,
  '{"source":"dashboard-test"}'::jsonb
from public.users as users
where users.id = '16100000-0000-0000-0000-00000000000a'
on conflict (family_id, snapshot_month) do nothing;

do $$
declare
  v_overview jsonb;
  v_current_month date := private.family_calendar_month(now());
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_overview := public.get_economy_price_overview();

  perform pg_temp.assert(
    (v_overview->'current'->>'snapshot_month')::date = v_current_month,
    '親用物価概要は今月のスナップショットを返す');
  perform pg_temp.assert(
    (v_overview->'previous'->>'snapshot_month')::date = (v_current_month - interval '1 month')::date,
    '親用物価概要は直前のスナップショットを返す');
  perform pg_temp.assert(
    (v_overview->>'next_update_date')::date = (v_current_month + interval '1 month')::date,
    '次回更新日は翌月1日になる');
  perform pg_temp.assert(
    (v_overview->'current'->>'avg_circulating_gol')::numeric = 500
      and (v_overview->'current'->>'target_gol')::numeric = 3000,
    '親用物価概要は正式なgol項目を返す');
end;
$$;

select pg_temp.assert_rejected(
  format($sql$
    do $inner$
    begin
      perform set_config('request.jwt.claim.sub', %L, true);
      perform public.get_economy_price_overview();
    end;
    $inner$
  $sql$, '16100000-0000-0000-0000-0000000000a1'),
  '子どもによる親用物価概要の取得');

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.get_economy_price_overview()', 'execute'),
    'anon は親用物価概要RPCを実行できない');
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.get_economy_price_overview()', 'execute'),
    'authenticated は親用物価概要RPCを呼び出せる（親判定は関数内）');
end;
$$;

\echo '=== 9. 月次金庫入出金RPCは日本時間の月境界で集計し、子どもを拒否する ==='

do $$
declare
  v_family_id uuid;
  v_month_start timestamptz := private.family_month_start(private.family_calendar_month(now()));
  v_before jsonb;
  v_after jsonb;
begin
  select family_id into v_family_id
  from public.users
  where id = '16100000-0000-0000-0000-00000000000a';

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_before := public.get_current_month_treasury_flow();

  insert into public.economy_transactions (
    family_id, actor_user_id, type,
    from_account_type, from_user_id, to_account_type, to_user_id,
    amount, description, idempotency_key, created_at
  ) values
    (
      v_family_id, '16100000-0000-0000-0000-00000000000a', 'quest_reward',
      'treasury', null, 'wallet', '16100000-0000-0000-0000-0000000000a1',
      900, '前月末23:59の出金', 'dashboard-flow-before-month', v_month_start - interval '1 minute'
    ),
    (
      v_family_id, '16100000-0000-0000-0000-00000000000a', 'quest_reward',
      'treasury', null, 'wallet', '16100000-0000-0000-0000-0000000000a1',
      41, '当月1日0:00の出金', 'dashboard-flow-current-out', v_month_start
    ),
    (
      v_family_id, '16100000-0000-0000-0000-0000000000a1', 'store_purchase',
      'wallet', '16100000-0000-0000-0000-0000000000a1', 'treasury', null,
      37, '当月1日0:00の入金', 'dashboard-flow-current-in', v_month_start
    );

  v_after := public.get_current_month_treasury_flow();

  perform pg_temp.assert(
    (v_after->>'outflow')::bigint - (v_before->>'outflow')::bigint = 41,
    '前月末23:59の出金を除外し、当月1日0:00の出金だけを合計する');
  perform pg_temp.assert(
    (v_after->>'inflow')::bigint - (v_before->>'inflow')::bigint = 37,
    '当月1日0:00の金庫への入金を入金側へ合計する');
end;
$$;

select pg_temp.assert_rejected(
  format($sql$
    do $inner$
    begin
      perform set_config('request.jwt.claim.sub', %L, true);
      perform public.get_current_month_treasury_flow();
    end;
    $inner$
  $sql$, '16100000-0000-0000-0000-0000000000a1'),
  '子どもによる月次金庫入出金RPCの取得');

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.get_current_month_treasury_flow()', 'execute'),
    'anon は月次金庫入出金RPCを実行できない');
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.get_current_month_treasury_flow()', 'execute'),
    'authenticated は月次金庫入出金RPCを呼び出せる（親判定は関数内）');
end;
$$;

\echo '=== 親用ダッシュボードの物価検証を通過しました ==='

\echo '=== すべての検証を通過しました ==='

\echo '=== 10. 今月の残高を変えてから初めて計算しても指数は変わらない ==='

do $$
declare
  v_family uuid; v_first public.economy_monthly_snapshots; v_later public.economy_monthly_snapshots;
  v_base timestamptz := private.family_month_start(private.family_calendar_month(now()));
begin
  select family_id into v_family from public.users where id = '16100000-0000-0000-0000-00000000000a';
  select * into v_first from public.economy_monthly_snapshots
    where family_id = v_family and snapshot_month = private.family_calendar_month(now());
  -- 月の途中の報酬・購入・預入・引き出しが記録済みという状況を作る。
  insert into public.wallet_circulation_changes(family_id, amount, recorded_at) values
    (v_family, 9000, v_base + interval '10 days'),
    (v_family, -200, v_base + interval '11 days'),
    (v_family, -300, v_base + interval '12 days'),
    (v_family, 100, v_base + interval '13 days');
  update public.users set balance = 20000 where id = '16100000-0000-0000-0000-0000000000a1';
  -- キャッシュによる同一結果ではなく、月途中に初めて作る場合を検証する。
  delete from public.economy_monthly_snapshots where id = v_first.id;
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-0000000000a1', true);
  v_later := public.get_or_create_monthly_price_index();
  perform pg_temp.assert(v_later.avg_circulating_gol = v_first.avg_circulating_gol
    and v_later.target_gol = v_first.target_gol and v_later.price_index = v_first.price_index,
    '今月の増減後に子どもが初めて計算しても、前月平均・適正量・指数は同じ');
end;
$$;

\echo '=== 11. 変更のない日も含む前月平均・月境界・閏年・記録不足 ==='

begin;
do $$
declare
  v_family uuid; v_start timestamptz; v_end timestamptz; v_average numeric;
begin
  select family_id into v_family from public.users where id = '16100000-0000-0000-0000-00000000000b';
  delete from public.wallet_circulation_changes where family_id = v_family;
  update public.wallet_circulation_tracking set known_from = '-infinity' where family_id = v_family;
  v_start := private.family_month_start(date '2028-02-01');
  v_end := private.family_month_start(date '2028-03-01');
  insert into public.wallet_circulation_changes(family_id, amount, recorded_at) values
    (v_family, 100, v_start - interval '1 second'),
    (v_family, 100, v_start),
    (v_family, 200, v_start + (v_end - v_start) / 2),
    (v_family, 99999, v_end);
  -- 前半200、後半400。閏年の2月29日まで含む平均は300。
  v_average := private.wallet_circulation_average(v_family, date '2028-02-01');
  perform pg_temp.assert(v_average = 300, '閏年2月は前半200・後半400で平均300、月末境界は除外');
  perform set_config('TimeZone', 'America/Los_Angeles', true);
  perform pg_temp.assert(private.wallet_circulation_average(v_family, date '2028-02-01') = 300,
    '平均もDBセッションのタイムゾーンに依存しない');
  delete from public.wallet_circulation_changes where family_id = v_family;
  insert into public.wallet_circulation_changes(family_id, amount, recorded_at) values
    (v_family, 1, private.family_month_start(date '2026-12-01') + interval '1 day');
  perform pg_temp.assert(abs(private.wallet_circulation_average(v_family, date '2026-12-01') - 30::numeric / 31) < 0.000000001,
    '31日の月では変更後30日分を重みとし、平均の端数を丸めない');
  update public.wallet_circulation_tracking set known_from = v_start + interval '1 second'
    where family_id = v_family;
  perform pg_temp.assert(private.wallet_circulation_average(v_family, date '2028-02-01') is null,
    '1秒でも月初の記録が欠ける場合は部分月を平均にしない');
end;
$$;
rollback;

\echo '=== 12. 記録不足では100、確定済み月は後から変更しない ==='

begin;
do $$
declare v_family uuid; v_snapshot public.economy_monthly_snapshots;
begin
  select family_id into v_family from public.users where id = '16100000-0000-0000-0000-00000000000a';
  update public.wallet_circulation_tracking set known_from = clock_timestamp() where family_id = v_family;
  delete from public.economy_monthly_snapshots
    where family_id = v_family and snapshot_month = private.family_calendar_month(now());
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_snapshot := public.get_or_create_monthly_price_index();
  perform pg_temp.assert(v_snapshot.price_index = 100
    and not (v_snapshot.calculation_basis->>'circulating_history_complete')::boolean
    and v_snapshot.calculation_basis->'circulating_average' = 'null'::jsonb,
    '記録不足の月は100で、平均が欠測と分かる根拠を保存する');
  update public.wallet_circulation_tracking set known_from = '-infinity' where family_id = v_family;
  perform pg_temp.assert((public.get_or_create_monthly_price_index()).id = v_snapshot.id
    and (public.get_or_create_monthly_price_index()).price_index = 100,
    '後から履歴がそろっても確定済みの指数は維持する');
end;
$$;
rollback;

\echo '=== 13. 実残高の変更だけを記録し、失敗時は記録も取り消す ==='

begin;
do $$
declare v_family uuid; v_before numeric; v_count bigint;
begin
  select family_id into v_family from public.users where id = '16100000-0000-0000-0000-00000000000a';
  select coalesce(sum(amount), 0), count(*) into v_before, v_count
    from public.wallet_circulation_changes where family_id = v_family;
  update public.users set balance = balance + 70 where id = '16100000-0000-0000-0000-0000000000a1';
  update public.users set balance = balance - 20 where id = '16100000-0000-0000-0000-0000000000a1';
  update public.users set balance = balance + 1000 where id = '16100000-0000-0000-0000-00000000000a';
  update public.users set balance = balance where id = '16100000-0000-0000-0000-0000000000a1';
  insert into public.transactions(user_id, type, description, amount)
    values('16100000-0000-0000-0000-0000000000a1', 'bank_interest', 'Walletを動かさない預金利息', 10000);
  perform pg_temp.assert((select sum(amount) from public.wallet_circulation_changes where family_id = v_family) = v_before + 50
    and (select count(*) from public.wallet_circulation_changes where family_id = v_family) = v_count + 2,
    '子の実残高の差だけを記録し、親・同額更新・個人履歴の預金利息は含めない');
  begin
    update public.users set balance = balance + 123 where id = '16100000-0000-0000-0000-0000000000a1';
    raise exception '検証用の業務失敗';
  exception when raise_exception then null;
  end;
  perform pg_temp.assert((select sum(amount) from public.wallet_circulation_changes where family_id = v_family) = v_before + 50,
    '業務処理失敗時は流通量の記録もロールバックする');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.wallet_circulation_changes', 'select')
    and not has_table_privilege('authenticated', 'public.wallet_circulation_tracking', 'update')
    and not has_function_privilege('authenticated', 'private.wallet_circulation_average(uuid,date)', 'execute')
    and not has_function_privilege('anon', 'private.record_wallet_circulation_change()', 'execute'),
    '利用者は履歴の直接参照・改ざん・他家庭を指定した平均計算ができない');
end;
$$;
rollback;

\echo '=== 14. 子どもの追加・ロール変更・削除と家庭境界 ==='

begin;
do $$
declare v_family uuid; v_other uuid; v_other_total numeric;
begin
  select family_id into v_family from public.users where id = '16100000-0000-0000-0000-00000000000b';
  select family_id into v_other from public.users where id = '16100000-0000-0000-0000-00000000000a';
  select sum(amount) into v_other_total from public.wallet_circulation_changes where family_id = v_other;
  perform pg_temp.assert(private.wallet_circulation_average(v_family, date '2020-01-01') = 0,
    '記録開始後に作った家庭の誕生前は流通0と分かる');
  insert into public.users(id, name, role, balance, family_id)
    values('28900000-0000-0000-0000-000000000001', '流通量検証用の子', 'child', 12, v_family);
  perform pg_temp.assert((select sum(amount) from public.wallet_circulation_changes where family_id = v_family) = 12,
    '子どもの追加時の残高も記録する');
  update public.users set role = 'parent' where id = '28900000-0000-0000-0000-000000000001';
  perform pg_temp.assert((select sum(amount) from public.wallet_circulation_changes where family_id = v_family) = 0,
    '親へロール変更した残高は流通から除く');
  update public.users set role = 'child' where id = '28900000-0000-0000-0000-000000000001';
  delete from public.users where id = '28900000-0000-0000-0000-000000000001';
  perform pg_temp.assert((select sum(amount) from public.wallet_circulation_changes where family_id = v_family) = 0
    and (select sum(amount) from public.wallet_circulation_changes where family_id = v_other) = v_other_total,
    '子どもへ戻してから削除しても過去記録は残り、他家庭の流通量は変わらない');
end;
$$;
rollback;

\echo '=== Issue #289 の検証を通過しました ==='
