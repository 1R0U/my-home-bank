-- Issue #161: 物価指数（recalculate_price_index）の動作を検証する -------------
--
-- supabase/migrations/*.sql をすべて適用した直後の空のDBに対して実行する。
-- 失敗した時点で exception を投げ、CIのジョブを落とす。
-- tests/sql/store_assertions.sql と同じ方針（pg_temp.assert ヘルパーを使った実行テスト）。
--
-- Issue #161 の完了条件との対応:
--   1. 日付     → private.family_calendar_month の月境界と、セッションのタイムゾーンに依存しないこと
--   2. 境界値   → private.price_index_for の 74/75、124/125、174/175
--   3. 集計     → 子どものWalletと、直近30日のクエスト報酬だけが数えられる
--   4. 再実行   → 同じ月にもう一度呼んでも同じ結果が返り、行が増えない
--   5. ゼロ件   → 子どもも報酬もない家族では物価指数100になる
--   6. 認可     → 家族に属さない利用者は拒否され、テーブルは直接読めない

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

\echo '=== 1. 日本時間の暦で月が決まる ==='

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
end;
$$;

do $$
begin
  -- Supabase の既定は UTC だが、それに依存していないことを確かめる
  perform set_config('TimeZone', 'America/Los_Angeles', true);
  perform pg_temp.assert(
    private.family_calendar_month('2026-09-30 15:00:00+00') = date '2026-10-01',
    'セッションのタイムゾーンが America/Los_Angeles でも日本時間の10月になる');
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

-- 親のWalletは流通HMCに含まれないことを確かめるため、あえて残高を持たせる
update public.users set balance = 777 where id = '16100000-0000-0000-0000-00000000000a';

insert into public.transactions (user_id, type, description, amount, created_at) values
  ('16100000-0000-0000-0000-0000000000a1', 'quest_reward', '直近の報酬', 1000, now()),
  ('16100000-0000-0000-0000-0000000000a2', 'quest_reward', '31日前の報酬（対象外）', 5000, now() - interval '31 days'),
  ('16100000-0000-0000-0000-0000000000a1', 'store_purchase', 'クエスト報酬以外（対象外）', -300, now());

\echo '=== 3. 子どものWalletと直近30日の報酬だけで計算される ==='

do $$
declare
  v_snapshot public.economy_monthly_snapshots;
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_snapshot := public.recalculate_price_index();

  perform pg_temp.assert(
    v_snapshot.avg_circulating_hmc = 500,
    format('流通HMCは子どものWallet合計で、親の777は含まない（実際: %s）', v_snapshot.avg_circulating_hmc));
  perform pg_temp.assert(
    v_snapshot.target_hmc = 2000,
    format('適正流通HMCは直近30日の報酬1000×2か月。31日前の報酬と購入は含まない（実際: %s）', v_snapshot.target_hmc));
  perform pg_temp.assert(
    v_snapshot.price_index = 95,
    format('500÷2000=25%% でデフレ(95)（実際: %s）', v_snapshot.price_index));
  perform pg_temp.assert(
    v_snapshot.snapshot_month = private.family_calendar_month(now()),
    '日本時間の今月として記録される');
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
  v_second := public.recalculate_price_index();

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
  v_snapshot := public.recalculate_price_index();

  perform pg_temp.assert(
    v_snapshot.price_index = 100 and v_snapshot.target_hmc = 0 and v_snapshot.avg_circulating_hmc = 0,
    format('流通0・適正0で安定(100)（実際: 物価%s、適正%s、流通%s）',
           v_snapshot.price_index, v_snapshot.target_hmc, v_snapshot.avg_circulating_hmc));
end;
$$;

\echo '=== 6. 認可 ==='

select pg_temp.assert_rejected(
  format($sql$
    do $inner$
    begin
      perform set_config('request.jwt.claim.sub', %L, true);
      perform public.recalculate_price_index();
    end;
    $inner$
  $sql$, '16100000-0000-0000-0000-00000000000c'),
  '家族に属さない利用者による再計算');

set role authenticated;

do $$
declare
  v_count int;
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);

  -- 権限エラーになるか、RLSで0件になるかのどちらでも「直接読めない」とみなす
  begin
    select count(*) into v_count from public.economy_monthly_snapshots;
  exception when insufficient_privilege then
    v_count := 0;
  end;
  perform pg_temp.assert(v_count = 0, 'authenticated ロールからスナップショットを直接読めない');

  begin
    select count(*) into v_count from public.economy_settings;
  exception when insufficient_privilege then
    v_count := 0;
  end;
  perform pg_temp.assert(v_count = 0, 'authenticated ロールから経済設定を直接読めない');
end;
$$;

reset role;

\echo '=== すべての検証を通過しました ==='
