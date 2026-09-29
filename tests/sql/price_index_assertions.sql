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
--
-- Issue #289 の完了条件との対応（流通ゴルを前月の平均お財布残高にする）:
--   3-2. 台帳から再現した残高の時間加重平均が、手計算の値と一致する
--   3-3. 月の途中に実際のRPCで入出金しても、流通ゴルが変わらない
--   3-4. お財布を動かす取引種別が増えたら、再現に含めるかの判断を促す

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

-- Issue #289: 流通ゴルは台帳から前月の残高を再現して平均するため、上の報酬と残高が矛盾しないようにする。
-- 前月中の入出金は同じ時刻の預入で打ち消し、前月のあいだ子A1は500、子A2は0のままにする。
-- 今月に入ってからの報酬700は今の残高に含めるので、子A1の今の残高は500+700=1200。
insert into public.transactions (user_id, type, description, amount, created_at)
select v.user_id, 'bank_deposit', v.description, v.amount, v.created_at
from (select private.family_month_start(private.family_calendar_month(now())) as base) as b
cross join lateral (values
  ('16100000-0000-0000-0000-0000000000a1'::uuid, '月初の前日の入出金を打ち消す', -700, b.base - interval '1 day'),
  ('16100000-0000-0000-0000-0000000000a1'::uuid, '30日前の報酬を打ち消す', -500, b.base - interval '30 days'),
  ('16100000-0000-0000-0000-0000000000a2'::uuid, '30日と1秒前の報酬を打ち消す', -5000, b.base - interval '30 days' - interval '1 second')
) as v(user_id, description, amount, created_at);

update public.users set balance = 1200 where id = '16100000-0000-0000-0000-0000000000a1';

-- 作られる前の残高は0として扱うため、前月より前からいたことにする。
-- 親も同じにして、親のお財布が「作られる前だから0」ではなく「親だから」含まれないことを確かめる。
update public.users
set created_at = private.family_month_start((private.family_calendar_month(now()) - interval '1 month')::date)
  - interval '1 day'
where id in (
  '16100000-0000-0000-0000-00000000000a',
  '16100000-0000-0000-0000-0000000000a1',
  '16100000-0000-0000-0000-0000000000a2'
);

\echo '=== 3. 子どものお財布と、基準時刻の直前30日間の報酬だけで計算される ==='

do $$
declare
  v_snapshot public.economy_monthly_snapshots;
begin
  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  v_snapshot := public.get_or_create_monthly_price_index();

  perform pg_temp.assert(
    v_snapshot.avg_circulating_gol = 500,
    format('流通ゴルは子どもの前月の平均お財布残高の合計で、今の残高1200や親の777は含まない（実際: %s）',
           v_snapshot.avg_circulating_gol));
  perform pg_temp.assert(
    (v_snapshot.calculation_basis->>'circulating_window_start')::timestamptz
      = private.family_month_start((v_snapshot.snapshot_month - interval '1 month')::date)
      and (v_snapshot.calculation_basis->>'circulating_window_end')::timestamptz
        = private.family_month_start(v_snapshot.snapshot_month),
    '計算根拠に流通ゴルの対象期間（日本時間の前月1日0:00〜今月1日0:00）が残る');
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
    (v_snapshot.calculation_basis->>'child_count')::int = 2,
    '計算根拠に子どもの人数(2)が残る');
end;
$$;

\echo '=== 3-2. お財布残高の時間加重平均を台帳から正しく再現する（Issue #289）==='

-- 期間 5/1 0:00〜5/11 0:00（UTC、10日間）で、手計算できる値を確かめる。
insert into public.users (id, name, role, balance, created_at) values
  ('28900000-0000-0000-0000-0000000000c1', '平均検証用の子C1', 'child', 250, '2026-04-01 00:00+00'),
  ('28900000-0000-0000-0000-0000000000c2', '平均検証用の子C2', 'child', 100, '2026-05-06 00:00+00');

-- 子C1: 5/3 報酬+300、5/5 ローン貸出+100（economy_transactions だけに記録）、5/8 購入-200、
-- 期間後の 5/20 に報酬+50。今の残高は250。
-- 5/9 の economy_transactions のクエスト報酬は transactions にも記録される種別なので、数えない。
insert into public.transactions (user_id, type, description, amount, created_at) values
  ('28900000-0000-0000-0000-0000000000c1', 'quest_reward', '5/3の報酬', 300, '2026-05-03 00:00+00'),
  ('28900000-0000-0000-0000-0000000000c1', 'store_purchase', '5/8の購入', -200, '2026-05-08 00:00+00'),
  ('28900000-0000-0000-0000-0000000000c1', 'quest_reward', '期間後の報酬', 50, '2026-05-20 00:00+00');

insert into public.economy_transactions (
  family_id, actor_user_id, type,
  from_account_type, from_user_id, to_account_type, to_user_id,
  amount, description, idempotency_key, created_at
)
select users.family_id, users.id, v.type,
  'treasury', null, 'wallet', '28900000-0000-0000-0000-0000000000c1',
  v.amount, v.description, v.key, v.created_at
from public.users as users
cross join (values
  ('loan_disburse', 100, '5/5のローン貸出', 'avg-test-loan', timestamptz '2026-05-05 00:00+00'),
  ('quest_reward', 999, '両方の台帳に記録される種別（数えない）', 'avg-test-quest', timestamptz '2026-05-09 00:00+00')
) as v(type, amount, description, key, created_at)
where users.id = '16100000-0000-0000-0000-00000000000a';

do $$
begin
  -- 5/11以降の入出金を戻すと期間末の残高は 250-50=200。そこから逆にたどると
  --   5/8〜5/11: 200（3日）/ 5/5〜5/8: 400（3日）/ 5/3〜5/5: 300（2日）/ 5/1〜5/3: 0（2日）
  --   平均 = (200*3 + 400*3 + 300*2 + 0*2) / 10 = 240
  perform pg_temp.assert(
    private.wallet_balance_average(
      '28900000-0000-0000-0000-0000000000c1', '2026-05-01 00:00+00', '2026-05-11 00:00+00'
    ) = 240,
    format('入出金とローンを時間加重で平均する（期待: 240, 実際: %s）', private.wallet_balance_average(
      '28900000-0000-0000-0000-0000000000c1', '2026-05-01 00:00+00', '2026-05-11 00:00+00')));

  -- 子C2は5/6に作られたため、それより前は0として扱う: 100 * 5日 / 10日 = 50
  perform pg_temp.assert(
    private.wallet_balance_average(
      '28900000-0000-0000-0000-0000000000c2', '2026-05-01 00:00+00', '2026-05-11 00:00+00'
    ) = 50,
    '期間の途中で作られた利用者は、作られる前を0として平均する');

  perform pg_temp.assert(
    private.wallet_balance_average(
      '28900000-0000-0000-0000-0000000000c1', '2026-05-11 00:00+00', '2026-05-11 00:00+00'
    ) = 0,
    '長さ0の期間では0を返す（0除算しない）');
end;
$$;

delete from public.economy_transactions where idempotency_key in ('avg-test-loan', 'avg-test-quest');
delete from public.transactions where user_id = '28900000-0000-0000-0000-0000000000c1';
delete from public.users where id in (
  '28900000-0000-0000-0000-0000000000c1', '28900000-0000-0000-0000-0000000000c2'
);

\echo '=== 3-3. 月の途中で入出金があっても、流通ゴルは変わらない（Issue #289）==='

-- 実際のRPCでお財布を動かし、そのあとで計算しても前月の平均が変わらないことを確かめる。
-- 銀行の預入・引き出し（transactions に記録）と、ローンの貸出・返済（economy_transactions に記録）を使う。
do $$
declare
  v_family_id uuid;
  v_month date := private.family_calendar_month(now());
  v_before numeric;
  v_after numeric;
  v_loan_id uuid;
begin
  select family_id into v_family_id
  from public.users where id = '16100000-0000-0000-0000-00000000000a';

  v_before := private.circulating_gol_for(v_family_id, v_month);

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-0000000000a1', true);
  perform public.bank_deposit('16100000-0000-0000-0000-0000000000a1', 100);
  perform public.bank_withdraw('16100000-0000-0000-0000-0000000000a1', 40);

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  perform public.update_loan_settings('16100000-0000-0000-0000-0000000000a1', 500, 0.05, 30);

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-0000000000a1', true);
  v_loan_id := public.request_loan(
    '16100000-0000-0000-0000-0000000000a1', 200, '流通ゴル検証', 0.05, 30, 'price-index-mid-month-loan');

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-00000000000a', true);
  perform public.approve_loan(v_loan_id, '16100000-0000-0000-0000-00000000000a');

  perform set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-0000000000a1', true);
  perform public.repay_loan(
    v_loan_id, '16100000-0000-0000-0000-0000000000a1', 50, 'price-index-mid-month-repay');

  perform pg_temp.assert(
    (select balance from public.users where id = '16100000-0000-0000-0000-0000000000a1') = 1200 - 100 + 40 + 200 - 50,
    '検証の前提: RPCで子A1のお財布が実際に動いている（1290）');

  v_after := private.circulating_gol_for(v_family_id, v_month);

  perform pg_temp.assert(
    v_before = 500 and v_after = v_before,
    format('今月の入出金のあとで計算しても、流通ゴルは前月の平均のまま（前: %s, 後: %s）', v_before, v_after));

  -- 上のRPCの記録時刻はどれも now() なので、その直後の1秒間の平均は「全部を反映した残高」になる。
  -- これが今の残高と一致していれば、RPCでの入出金はすべて台帳から数えられている。
  perform pg_temp.assert(
    private.wallet_balance_average(
      '16100000-0000-0000-0000-0000000000a1', now(), now() + interval '1 second'
    ) = 1290,
    '台帳から再現した直近の残高が、今のお財布残高と一致する');
end;
$$;

\echo '=== 3-4. お財布を動かす新しい取引種別が増えたら気づける（Issue #289）==='

-- 流通ゴルは transactions の全件と、economy_transactions のローン3種からお財布残高を再現する。
-- economy_transactions に種別が増えたら、transactions にも記録されるか（数えなくてよい）、
-- されないか（private.wallet_balance_average へ足す）を判断してから、この一覧を更新する。
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid = 'public.economy_transactions'::regclass
    and conname = 'economy_transactions_type_check';

  perform pg_temp.assert(
    v_definition = 'CHECK ((type = ANY (ARRAY[''treasury_initialization''::text, ''treasury_issue''::text, '
      || '''quest_reward''::text, ''store_purchase''::text, ''loan_disburse''::text, '
      || '''loan_repay_principal''::text, ''loan_interest''::text, ''savings_auto_transfer''::text, '
      || '''savings_withdraw''::text, ''savings_interest''::text])))',
    format('economy_transactions の取引種別が想定どおり。増えた場合は流通ゴルの再現に含めるか判断する（実際: %s）',
           v_definition));
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
