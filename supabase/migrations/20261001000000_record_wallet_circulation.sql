-- Issue #289: 個人履歴には預金利息などWalletを動かさない記録もあるため、
-- usersの実残高の変化を同じトランザクションで記録する。過去の残高は推測しない。
-- 既存利用者の残高と記録開始点の間に更新が入らないよう、業務操作と同じ順で止める。
lock table public.users in share row exclusive mode;
lock table public.families in share row exclusive mode;

create table public.wallet_circulation_tracking (
  family_id uuid primary key references public.families(id) on delete cascade,
  -- 新規家庭は誕生前の流通量が0と分かるため、-infinityから履歴が完全とする。
  known_from timestamptz not null
);
create table public.wallet_circulation_changes (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  amount numeric not null,
  recorded_at timestamptz not null
);
create index wallet_circulation_changes_family_time_idx
  on public.wallet_circulation_changes(family_id, recorded_at);
alter table public.wallet_circulation_tracking enable row level security;
alter table public.wallet_circulation_changes enable row level security;
revoke all on public.wallet_circulation_tracking, public.wallet_circulation_changes
  from public, anon, authenticated;

-- 既存家庭は適用時の合計から記録を始める。月初へ遡って記帳しない。
insert into public.wallet_circulation_tracking(family_id, known_from)
select id, clock_timestamp() from public.families;
insert into public.wallet_circulation_changes(family_id, amount, recorded_at)
select t.family_id, coalesce(sum(u.balance), 0), t.known_from
from public.wallet_circulation_tracking t
left join public.users u on u.family_id = t.family_id and u.role = 'child'
group by t.family_id, t.known_from;

create function private.start_wallet_circulation_tracking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wallet_circulation_tracking(family_id, known_from)
  values(new.id, '-infinity');
  return new;
end;
$$;
create trigger start_wallet_circulation_tracking_after_insert
after insert on public.families for each row
execute function private.start_wallet_circulation_tracking();

create function private.record_wallet_circulation_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_family uuid; v_new_family uuid;
  v_old_amount numeric := 0; v_new_amount numeric := 0;
  v_at timestamptz;
begin
  if tg_op <> 'INSERT' and old.role = 'child' and old.family_id is not null then
    v_old_family := old.family_id; v_old_amount := old.balance;
  end if;
  if tg_op <> 'DELETE' and new.role = 'child' and new.family_id is not null then
    v_new_family := new.family_id; v_new_amount := new.balance;
  end if;
  if v_old_family is not distinct from v_new_family and v_old_amount = v_new_amount then
    return null;
  end if;
  -- 指数の確定と残高記録を家庭ごとに直列化する。ロック取得後の実時刻を記帳し、
  -- 月初をまたいで待機した操作を前月へ遡らせない。usersの追加ロックは取らない。
  perform 1 from public.families
  where id in (v_old_family, v_new_family) order by id for no key update;
  v_at := clock_timestamp();
  if v_old_family is not distinct from v_new_family then
    insert into public.wallet_circulation_changes(family_id, amount, recorded_at)
    values(v_new_family, v_new_amount - v_old_amount, v_at);
  else
    if v_old_family is not null then
      insert into public.wallet_circulation_changes(family_id, amount, recorded_at)
      values(v_old_family, -v_old_amount, v_at);
    end if;
    if v_new_family is not null then
      insert into public.wallet_circulation_changes(family_id, amount, recorded_at)
      values(v_new_family, v_new_amount, v_at);
    end if;
  end if;
  return null;
end;
$$;
create trigger record_wallet_circulation_change_after_write
after insert or update of balance, role, family_id or delete on public.users
for each row execute function private.record_wallet_circulation_change();

-- 月内の各残高が続いた秒数による時間加重平均。月初の残高はそれ以前の変化の合計。
-- 変更がない日もその残高を保ち、月末ちょうどの変更は翌月へ入る。
-- 全期間が記録されていないときはNULLを返す。部分月の値を前月平均にしない。
create function private.wallet_circulation_average(p_family uuid, p_month date)
returns numeric language sql stable set search_path = '' as $$
  select case when t.known_from <= private.family_month_start(p_month) then
    coalesce((
      select sum(c.amount * extract(epoch from (
        private.family_month_start((p_month + interval '1 month')::date)
          - greatest(c.recorded_at, private.family_month_start(p_month)))))
      from public.wallet_circulation_changes c
      where c.family_id = p_family
        and c.recorded_at < private.family_month_start((p_month + interval '1 month')::date)
    ), 0) / extract(epoch from (
      private.family_month_start((p_month + interval '1 month')::date)
        - private.family_month_start(p_month)))
    else null end
  from public.wallet_circulation_tracking t where t.family_id = p_family;
$$;
revoke all on function private.start_wallet_circulation_tracking() from public, anon, authenticated;
revoke all on function private.record_wallet_circulation_change() from public, anon, authenticated;
revoke all on function private.wallet_circulation_average(uuid, date) from public, anon, authenticated;

create or replace function public.get_or_create_monthly_price_index()
returns public.economy_monthly_snapshots
language plpgsql security definer set search_path = '' as $function$
declare
  v_family_id uuid;
  v_at timestamptz; v_month date; v_previous_month date; v_base timestamptz;
  v_existing public.economy_monthly_snapshots%rowtype;
  v_thresholds jsonb; v_target_months numeric; v_circulating numeric;
  v_child_count int; v_reward_total numeric; v_target numeric; v_price_index int;
begin
  select family_id into v_family_id from public.users where id = auth.uid();
  if v_family_id is null then raise exception '家族に所属していません'; end if;
  -- 更新トリガーと同じ家庭ロック。過去月の更新が確定するまで待ってから月を決める。
  perform 1 from public.families where id = v_family_id for no key update;
  v_at := clock_timestamp();
  v_month := private.family_calendar_month(v_at);
  v_previous_month := (v_month - interval '1 month')::date;
  v_base := private.family_month_start(v_month);
  select * into v_existing from public.economy_monthly_snapshots
    where family_id = v_family_id and snapshot_month = v_month;
  if found then return v_existing; end if;

  insert into public.economy_settings(family_id) values(v_family_id) on conflict do nothing;
  select price_index_thresholds, target_months into v_thresholds, v_target_months
    from public.economy_settings where family_id = v_family_id;
  v_circulating := private.wallet_circulation_average(v_family_id, v_previous_month);
  select count(*) into v_child_count from public.users
    where family_id = v_family_id and role = 'child';
  select coalesce(sum(t.amount), 0) into v_reward_total
  from public.transactions t join public.users u on u.id = t.user_id
  where u.family_id = v_family_id and u.role = 'child' and t.type = 'quest_reward'
    and t.created_at >= v_base - interval '30 days' and t.created_at < v_base;
  v_target := v_reward_total * v_target_months;
  -- 移行期間は推測せず安定(100)。NULLは根拠に残し、互換上NOT NULLの列には0を格納。
  v_price_index := case when v_circulating is null then 100
    else private.price_index_for(v_circulating, v_target, v_thresholds) end;
  insert into public.economy_monthly_snapshots(
    family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis)
  values(v_family_id, v_month, coalesce(v_circulating, 0), v_target, v_price_index,
    jsonb_build_object(
      'calculated_at', v_at, 'child_count', v_child_count,
      'quest_reward_total_30d', v_reward_total,
      'reward_window_start', v_base - interval '30 days', 'reward_window_end', v_base,
      'target_months', v_target_months, 'thresholds', v_thresholds,
      'circulating_basis', '前月のWallet残高の時間加重平均',
      'circulating_window_start', private.family_month_start(v_previous_month),
      'circulating_window_end', v_base,
      'circulating_history_complete', v_circulating is not null,
      'circulating_average', v_circulating))
  returning * into v_existing;
  return v_existing;
end;
$function$;
revoke all on function public.get_or_create_monthly_price_index() from public, anon;
grant execute on function public.get_or_create_monthly_price_index() to authenticated;
comment on function public.get_or_create_monthly_price_index() is
  'Issue #289: 前月のWallet残高の時間加重平均から今月の物価指数を確定する。前月の記録不足時は100、保存済みの月は維持';
comment on table public.wallet_circulation_tracking is
  'Issue #289: 家庭のWallet実残高の履歴が完全と分かる開始点';
comment on table public.wallet_circulation_changes is
  'Issue #289: 家庭の子どものWallet合計の実際の変化。個人履歴との二重集計をしない';

-- 購入RPCは指数の取得後に送金するため、そのままだとfamilies → users/金庫となる。
-- 送金に必要なusers → 金庫を先にロックしてから指数を取得し、
-- 銀行・報酬・積立のusers → 金庫/口座 → familiesと順序をそろえる。
-- 未適用ファイルの番号修正(#330)は内容を変えず、この新規マイグレーションで更新する。
do $$
declare
  v_definition text;
  v_pattern text := 'select\s+\*\s+into\s+v_snapshot\s+from\s+public\.get_or_create_monthly_price_index\(\);';
begin
  v_definition := pg_get_functiondef(
    'private.purchase_store_item_with_treasury_unchecked(uuid, uuid, text, bigint)'::regprocedure);
  if v_definition !~ v_pattern then
    raise exception '購入RPCの物価取得箇所が想定と異なります。ロック順序を確認してください';
  end if;
  v_definition := regexp_replace(v_definition, v_pattern,
    'perform 1 from public.users where id = p_user_id for update;
  perform 1 from public.guild_treasuries where family_id = v_family_id for update;
  select * into v_snapshot from public.get_or_create_monthly_price_index();');
  execute v_definition;
end;
$$;
