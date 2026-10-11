-- Issue #225: 既存家庭にも全種類を追加。通常商品・購入履歴・所有は変更しない。
do $$ declare v_family_id uuid; begin
  for v_family_id in select family_id from public.guild_treasuries loop
    perform private.seed_family_store_assets(v_family_id);
  end loop;
end; $$;

-- 手動販売したアセットは履歴の参照先として残し、自動商品の横に重複表示しない。
update public.store_items set is_active = false
where asset_id is not null and not is_system_asset;
