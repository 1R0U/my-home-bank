-- Issue #298: 既存スナップショットの値を正式な gol 列へコピーする。
-- 旧列は互換用として残し、既存データ自体は変更しない。

update public.economy_monthly_snapshots
set
  avg_circulating_gol = avg_circulating_hmc,
  target_gol = target_hmc
where avg_circulating_gol is null
   or target_gol is null;
