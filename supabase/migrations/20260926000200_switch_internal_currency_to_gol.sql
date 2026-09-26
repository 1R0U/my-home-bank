-- Issue #298: DBの正式な内部名を gol へ切り替える。
-- 旧 hmc 列と issue_treasury_hmc RPC は、旧アプリの移行猶予のため互換用として残す。

do $$
begin
  if exists (
    select 1
    from public.economy_monthly_snapshots
    where avg_circulating_gol is null
       or target_gol is null
       or avg_circulating_gol is distinct from avg_circulating_hmc
       or target_gol is distinct from target_hmc
  ) then
    raise exception '物価指数スナップショットのgol列を安全に移行できません';
  end if;
end;
$$;

alter table public.economy_monthly_snapshots
  alter column avg_circulating_gol set not null,
  alter column target_gol set not null;

comment on column public.economy_monthly_snapshots.avg_circulating_hmc is
  'Issue #298: 旧クライアント互換用。新規実装はavg_circulating_golを使う。旧クライアントの利用終了確認後に削除する';
comment on column public.economy_monthly_snapshots.target_hmc is
  'Issue #298: 旧クライアント互換用。新規実装はtarget_golを使う。旧クライアントの利用終了確認後に削除する';

-- 適用済みマイグレーションを書き換えず、既存関数に残る利用者向けHMC文言をゴルへ更新する。
-- 識別子はこの後で個別に移行するため、ここでは大文字の表示文言だけを対象にする。
do $$
declare
  v_function oid;
begin
  for v_function in
    select p.oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosrc like '%HMC%'
  loop
    execute replace(pg_get_functiondef(v_function), 'HMC', 'ゴル');
  end loop;
end;
$$;

-- 現行の追加発行RPCを複製して、gol名を正式な入口にする。
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.issue_treasury_hmc(bigint, text)'::regprocedure);
  v_definition := replace(v_definition, 'issue_treasury_hmc', 'issue_treasury_gol');

  if v_definition not like '%issue_treasury_gol%' then
    raise exception 'issue_treasury_golの定義を作成できません';
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.issue_treasury_gol(bigint, text) from public, anon;
grant execute on function public.issue_treasury_gol(bigint, text) to authenticated;

comment on function public.issue_treasury_gol(bigint, text) is
  '親がゴルを追加発行する正式RPC。Issue #298でissue_treasury_hmcから移行';

-- 旧RPCは同じ正式RPCを呼ぶだけの互換ラッパーにして、処理の二重管理を避ける。
create or replace function public.issue_treasury_hmc(
  p_amount bigint,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.issue_treasury_gol(p_amount, p_idempotency_key)
$$;

revoke all on function public.issue_treasury_hmc(bigint, text) from public, anon;
grant execute on function public.issue_treasury_hmc(bigint, text) to authenticated;

comment on function public.issue_treasury_hmc(bigint, text) is
  'Issue #298: 旧クライアント互換用。新規実装はissue_treasury_golを使う。旧クライアントの利用終了確認後に削除する';

-- 月次物価指数RPCの実装を正式なgol列へ切り替える。
-- 戻り値には互換列も残るが、同期トリガーにより常にgol列と同じ値になる。
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.get_or_create_monthly_price_index()'::regprocedure
  );
  v_definition := replace(v_definition, 'avg_circulating_hmc', 'avg_circulating_gol');
  v_definition := replace(v_definition, 'target_hmc', 'target_gol');
  v_definition := replace(v_definition, 'HMC', 'ゴル');

  if v_definition like '%avg_circulating_hmc%'
    or v_definition like '%target_hmc%' then
    raise exception '物価指数RPCのgol列移行に失敗しました';
  end if;

  execute v_definition;
end;
$$;
