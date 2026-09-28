-- Issue #163: 親用の経済管理ダッシュボードで、今月と前月の物価情報をまとめて取得する。
-- economy_monthly_snapshots はクライアントから直接読ませないため、親だけが使えるRPCを追加する。

create function public.get_economy_price_overview()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_family_id uuid;
  v_role text;
  v_current public.economy_monthly_snapshots%rowtype;
  v_previous public.economy_monthly_snapshots%rowtype;
  v_previous_json jsonb;
begin
  select users.family_id, users.role
  into v_family_id, v_role
  from public.users as users
  where users.id = auth.uid();

  if v_family_id is null or v_role <> 'parent' then
    raise exception '親だけが経済管理情報を取得できます';
  end if;

  v_current := public.get_or_create_monthly_price_index();

  select snapshots.*
  into v_previous
  from public.economy_monthly_snapshots as snapshots
  where snapshots.family_id = v_family_id
    and snapshots.snapshot_month < v_current.snapshot_month
  order by snapshots.snapshot_month desc
  limit 1;

  v_previous_json := case
    when v_previous.id is null then null
    else jsonb_build_object(
      'id', v_previous.id,
      'family_id', v_previous.family_id,
      'snapshot_month', v_previous.snapshot_month,
      'avg_circulating_gol', v_previous.avg_circulating_gol,
      'target_gol', v_previous.target_gol,
      'price_index', v_previous.price_index,
      'calculation_basis', v_previous.calculation_basis,
      'created_at', v_previous.created_at
    )
  end;

  return jsonb_build_object(
    'current', jsonb_build_object(
      'id', v_current.id,
      'family_id', v_current.family_id,
      'snapshot_month', v_current.snapshot_month,
      'avg_circulating_gol', v_current.avg_circulating_gol,
      'target_gol', v_current.target_gol,
      'price_index', v_current.price_index,
      'calculation_basis', v_current.calculation_basis,
      'created_at', v_current.created_at
    ),
    'previous', v_previous_json,
    'next_update_date', (v_current.snapshot_month + interval '1 month')::date
  );
end;
$function$;

revoke all on function public.get_economy_price_overview() from public, anon;
grant execute on function public.get_economy_price_overview() to authenticated;

comment on function public.get_economy_price_overview() is
  'Issue #163: 親向け経済管理画面へ今月・前月の物価スナップショットと次回更新日を返す';
