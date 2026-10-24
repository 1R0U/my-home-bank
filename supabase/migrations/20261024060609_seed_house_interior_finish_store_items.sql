-- Issue #480: 既存の家庭にも、増やした家具の装飾と壁紙・床板を並べる。
-- 通常商品・購入履歴・所有は変更しない（20261011113832_backfill_automatic_store_assets.sql と同じ）。
do $$ declare v_family_id uuid; begin
  for v_family_id in select family_id from public.guild_treasuries loop
    perform private.seed_family_store_assets(v_family_id);
  end loop;
end; $$;
