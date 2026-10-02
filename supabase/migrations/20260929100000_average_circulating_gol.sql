-- Issue #289: 物価指数の流通ゴルを、呼んだ時刻に左右されない値にする
--
-- これまでの流通ゴルは「その月に最初に get_or_create_monthly_price_index() が呼ばれた時点の、
-- 子どものお財布残高の合計」だった(#161 の簡易版)。そのため、報酬を受け取った直後や
-- 買い物の直前に画面を開くだけで、その月の物価指数を動かせた。
--
-- これを #161 本来の仕様である「前月の平均お財布残高」にする。
--   ・対象期間は日本時間の前月1日 0:00 から今月1日 0:00 まで
--   ・残高が続いた秒数で重みを付けた時間加重平均(自動積立の private.savings_average と同じ考え方)
--   ・日々の残高は記録していないため、今の残高から台帳の入出金を逆にたどって各時点の残高を再現する
--
-- 再現に使う台帳:
--   ・public.transactions: お財布が動く操作はすべて、符号付きの増減額で記録されている
--     (クエスト報酬・ストア購入・銀行の預入/引き出し/借入/返済・自動積立の振替と引き出し)。
--     ただし bank_interest(自動積立の利息)はお財布を動かさないため除く
--   ・public.economy_transactions のローン3種: 金利付きローンの貸出・返済・利息だけは
--     transactions に記録されないため、ここから補う。
--     クエスト報酬・ストア購入・自動積立は両方の台帳に記録されるので、二重に数えないよう
--     ローン以外は transactions 側だけを使う
--   ・お財布残高(users.balance)は anon / authenticated から直接更新できず、変更はすべて
--     上の台帳へ記録する関数を通る。新しい取引種別を足したときは
--     tests/sql/price_index_assertions.sql の検査が落ちるので、ここに反映するかを判断する

-- 1. 利用者のお財布残高の、期間内の時間加重平均を返す
-- 今の残高と台帳を1つのSQL文で読むことで、同時に行われた入出金の途中状態を読まないようにする。
-- 期間の途中で作られた利用者は、作られる前の残高を0とする。
-- 台帳より前の時代の残高などで再現した残高が負になる場合は、0として扱う。
create function private.wallet_balance_average(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns numeric
language sql
stable
set search_path to ''
as $$
  with target_user as (
    select users.balance, users.created_at
    from public.users as users
    where users.id = p_user_id
  ),
  movements as (
    select transactions.created_at, transactions.amount::numeric as amount
    from public.transactions as transactions
    where transactions.user_id = p_user_id
      -- 自動積立の利息はギルド金庫から積立預金へ入り、お財布は動かない。
      -- 履歴画面用に transactions へ bank_interest として記録されるだけなので数えない
      and transactions.type <> 'bank_interest'
    union all
    select economy.created_at,
      case when economy.to_account_type = 'wallet' then economy.amount else -economy.amount end
    from public.economy_transactions as economy
    where economy.type in ('loan_disburse', 'loan_repay_principal', 'loan_interest')
      and (
        (economy.to_account_type = 'wallet' and economy.to_user_id = p_user_id)
        or (economy.from_account_type = 'wallet' and economy.from_user_id = p_user_id)
      )
  ),
  -- 期間の終わり(p_to)の時点の残高 = 今の残高 - p_to 以降の入出金
  end_balance as (
    select target_user.balance - coalesce((
      select sum(movements.amount) from movements where movements.created_at >= p_to
    ), 0) as balance
    from target_user
  ),
  -- 期間内の入出金を時刻ごとにまとめる
  points as (
    select movements.created_at as at, sum(movements.amount) as amount
    from movements
    where movements.created_at >= p_from and movements.created_at < p_to
    group by movements.created_at
  ),
  -- 各入出金の時刻から次の入出金(なければ期間の終わり)までの区間と、その間の残高
  segments as (
    select
      points.at as segment_start,
      lead(points.at, 1, p_to) over (order by points.at) as segment_end,
      end_balance.balance - coalesce(sum(points.amount) over (
        order by points.at rows between 1 following and unbounded following
      ), 0) as balance
    from points
    cross join end_balance
    union all
    -- 期間の始まりから最初の入出金までの区間
    select
      p_from,
      coalesce((select min(points.at) from points), p_to),
      end_balance.balance - coalesce((select sum(points.amount) from points), 0)
    from end_balance
  )
  select case
    when p_to <= p_from then 0
    else coalesce(sum(
      greatest(segments.balance, 0)
      * greatest(0, extract(epoch from (
          segments.segment_end - greatest(segments.segment_start, target_user.created_at)
        )))
    ), 0) / extract(epoch from (p_to - p_from))
  end
  from segments
  cross join target_user;
$$;

revoke all on function private.wallet_balance_average(uuid, timestamptz, timestamptz) from public;

comment on function private.wallet_balance_average(uuid, timestamptz, timestamptz) is
  'Issue #289: 利用者のお財布残高の、期間内の時間加重平均。今の残高から台帳を逆にたどって再現する';

-- 2. 家族の流通ゴル(子どもの前月の平均お財布残高の合計)を返す
-- tests/sql/price_index_assertions.sql から、月の途中で入出金があっても値が変わらないことを直接確かめるため、
-- RPCから切り出している。
create function private.circulating_gol_for(p_family_id uuid, p_month date)
returns numeric
language sql
stable
set search_path to ''
as $$
  select coalesce(sum(private.wallet_balance_average(
    users.id,
    private.family_month_start((p_month - interval '1 month')::date),
    private.family_month_start(p_month)
  )), 0)
  from public.users as users
  where users.family_id = p_family_id and users.role = 'child';
$$;

revoke all on function private.circulating_gol_for(uuid, date) from public;

comment on function private.circulating_gol_for(uuid, date) is
  'Issue #289: 家族の流通ゴル。子ども全員の、日本時間の前月のお財布残高の時間加重平均の合計';

-- 3. 物価指数RPCの流通ゴルを、前月の平均お財布残高に差し替える
-- 流通ゴル以外(適正流通ゴル・既存結果の返却・同時実行時の読み直し)は変えない。
-- 既に作られた月の結果は書き換えない。変わるのは、次にまだ結果のない月を計算するときから。
create or replace function public.get_or_create_monthly_price_index()
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

  -- 流通ゴル: 子どもの前月の平均お財布残高の合計
  -- 台帳から前月の残高を再現するため、今月のどの時点で呼んでも同じ値になる
  v_circulating := private.circulating_gol_for(v_family_id, v_month);

  select count(*)
  into v_child_count
  from public.users as users
  where users.family_id = v_family_id and users.role = 'child';

  -- 適正流通ゴル: 基準時刻の直前30日間に子どもが受け取ったクエスト報酬の合計 × target_months
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
    family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis
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
      'circulating_window_start', private.family_month_start((v_month - interval '1 month')::date),
      'circulating_window_end', v_base,
      'circulating_basis', '前月のお財布残高の時間加重平均（台帳から再現）'
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

comment on function public.get_or_create_monthly_price_index() is
  'Issue #161 / #289: 呼び出し元の家族の今月の物価指数を返す。その月に初めて呼ばれたときだけ計算して保存し、以降は保存済みの結果を返す。流通ゴルは前月の平均お財布残高';
