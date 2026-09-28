-- Issue #163: 台帳件数に依存せず、親用ダッシュボードへ今月の金庫入出金を返す。

create function public.get_current_month_treasury_flow()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_family_id uuid;
  v_role text;
  v_month date := private.family_calendar_month(now());
  v_month_start timestamptz := private.family_month_start(v_month);
  v_next_month_start timestamptz := private.family_month_start((v_month + interval '1 month')::date);
  v_inflow bigint;
  v_outflow bigint;
begin
  select users.family_id, users.role
  into v_family_id, v_role
  from public.users as users
  where users.id = auth.uid();

  if v_family_id is null or v_role <> 'parent' then
    raise exception '親だけが経済管理情報を取得できます';
  end if;

  select
    coalesce(sum(transactions.amount) filter (
      where transactions.to_account_type = 'treasury'
    ), 0),
    coalesce(sum(transactions.amount) filter (
      where transactions.from_account_type = 'treasury'
    ), 0)
  into v_inflow, v_outflow
  from public.economy_transactions as transactions
  where transactions.family_id = v_family_id
    and transactions.created_at >= v_month_start
    and transactions.created_at < v_next_month_start;

  return jsonb_build_object('inflow', v_inflow, 'outflow', v_outflow);
end;
$function$;

revoke all on function public.get_current_month_treasury_flow() from public, anon;
grant execute on function public.get_current_month_treasury_flow() to authenticated;

comment on function public.get_current_month_treasury_flow() is
  'Issue #163: 親用経済管理画面へ日本時間の今月分の金庫入出金合計を返す';
