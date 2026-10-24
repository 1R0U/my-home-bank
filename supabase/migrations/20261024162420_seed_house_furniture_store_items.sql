-- Issue #506: 既存の家庭にも、足したソファ・植木の装飾を並べる。
-- 通常商品・購入履歴・所有は変更しない（20261024060609_seed_house_interior_finish_store_items.sql と同じ）。
do $$ declare v_family_id uuid; begin
  for v_family_id in select family_id from public.guild_treasuries loop
    perform private.seed_family_store_assets(v_family_id);
  end loop;
end; $$;
