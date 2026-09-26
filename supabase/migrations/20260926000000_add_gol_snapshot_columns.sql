-- Issue #298: 物価指数スナップショットへ正式な gol 列を追加する。
-- 旧 hmc 列は、旧バージョンのクライアントとの互換性を保つため移行期間中だけ残す。

alter table public.economy_monthly_snapshots
  add column avg_circulating_gol numeric,
  add column target_gol numeric;

comment on column public.economy_monthly_snapshots.avg_circulating_gol is
  '計算時点の子どものお財布残高の合計。avg_circulating_hmc は互換用の旧名';
comment on column public.economy_monthly_snapshots.target_gol is
  '物価指数の基準にする適正流通ゴル。target_hmc は互換用の旧名';

-- 新旧どちらの列名から書き込まれても同じ値を保存する。
-- 両方を異なる値で指定した場合は、曖昧な更新を受け入れず停止する。
create function private.sync_economy_snapshot_gol_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.avg_circulating_gol is null then
      new.avg_circulating_gol := new.avg_circulating_hmc;
    elsif new.avg_circulating_hmc is null then
      new.avg_circulating_hmc := new.avg_circulating_gol;
    elsif new.avg_circulating_gol is distinct from new.avg_circulating_hmc then
      raise exception '流通ゴルの新旧列に異なる値は指定できません';
    end if;

    if new.target_gol is null then
      new.target_gol := new.target_hmc;
    elsif new.target_hmc is null then
      new.target_hmc := new.target_gol;
    elsif new.target_gol is distinct from new.target_hmc then
      raise exception '適正流通ゴルの新旧列に異なる値は指定できません';
    end if;
  else
    if new.avg_circulating_gol is distinct from old.avg_circulating_gol
      and new.avg_circulating_hmc is not distinct from old.avg_circulating_hmc then
      new.avg_circulating_hmc := new.avg_circulating_gol;
    elsif new.avg_circulating_hmc is distinct from old.avg_circulating_hmc
      and new.avg_circulating_gol is not distinct from old.avg_circulating_gol then
      new.avg_circulating_gol := new.avg_circulating_hmc;
    elsif new.avg_circulating_gol is distinct from new.avg_circulating_hmc then
      raise exception '流通ゴルの新旧列に異なる値は指定できません';
    end if;

    if new.target_gol is distinct from old.target_gol
      and new.target_hmc is not distinct from old.target_hmc then
      new.target_hmc := new.target_gol;
    elsif new.target_hmc is distinct from old.target_hmc
      and new.target_gol is not distinct from old.target_gol then
      new.target_gol := new.target_hmc;
    elsif new.target_gol is distinct from new.target_hmc then
      raise exception '適正流通ゴルの新旧列に異なる値は指定できません';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_economy_snapshot_gol_columns()
  from public, anon, authenticated;

create trigger sync_economy_snapshot_gol_columns_before_write
before insert or update of avg_circulating_hmc, target_hmc, avg_circulating_gol, target_gol
on public.economy_monthly_snapshots
for each row
execute function private.sync_economy_snapshot_gol_columns();
