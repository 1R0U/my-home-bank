-- Issue #225: 商品名と全種類の自動陳列。見た目は引き続きアプリのカタログが持つ。
update public.store_assets a set display_name = names.label
from (values
  ('decoration-bush', 'しげみ'),
  ('decoration-bush-berry', 'きのみのしげみ'),
  ('decoration-bush-tall', 'たてながのしげみ'),
  ('decoration-bush-wide', 'よこながのしげみ'),
  ('decoration-flowerbed', 'かだん'),
  ('decoration-grass', 'くさ'),
  ('decoration-grass-flower', 'はなのくさ'),
  ('decoration-grass-tall', 'たかいくさ'),
  ('decoration-grass-wide', 'ひろいくさ'),
  ('decoration-hanger-rack', 'ハンガーラック'),
  ('decoration-lamp', 'ランプ'),
  ('decoration-rock', 'いし'),
  ('decoration-rock-flat', 'ひらたいいし'),
  ('decoration-rock-pile', 'いしのやま'),
  ('decoration-rock-tall', 'たかいいし'),
  ('decoration-tree', 'き'),
  ('decoration-tree-pine', 'とがったき'),
  ('decoration-tree-tall', 'たかいき'),
  ('decoration-tree-young', 'わかぎ'),
  ('wearable-glasses', 'めがね'),
  ('wearable-hat', 'ぼうし'),
  ('wearable-cap', 'キャップ'),
  ('wearable-crown', 'おうかん'),
  ('wearable-straw-hat', 'むぎわらぼうし'),
  ('wearable-santa-hat', 'サンタのぼうし'),
  ('wearable-knit-hat', 'ニットぼうし'),
  ('wearable-sunglasses', 'サングラス'),
  ('wearable-eyepatch', 'がんたい'),
  ('wearable-mustache', 'つけひげ')
) as names(asset_id, label) where names.asset_id = a.asset_id;
alter table public.store_assets alter column display_name set not null;
alter table public.store_assets add constraint store_assets_display_name_valid
  check (length(btrim(display_name)) between 1 and 100);

create function private.default_store_asset_price(p_initial_supply bigint)
returns bigint language plpgsql immutable set search_path = '' as $$
begin
  if p_initial_supply is null or p_initial_supply < 0 or p_initial_supply > private.safe_integer_max() then
    raise exception '初期供給量が安全な整数の範囲外です';
  end if;
  return greatest(1, round(p_initial_supply::numeric / 200))::bigint;
end; $$;

create function private.seed_family_store_assets(p_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_initial_supply bigint;
begin
  select initial_supply into strict v_initial_supply from public.guild_treasuries where family_id = p_family_id;
  insert into public.store_items(family_id, asset_id, title, description, price, stock, requested_by, is_system_asset)
  select p_family_id, asset_id, display_name,
    case kind when 'wearable' then '買うと更衣室で装備できます。' else '買った数だけ町に配置できます。' end,
    private.default_store_asset_price(v_initial_supply), public.store_unlimited_stock(), null, true
  from public.store_assets
  on conflict (family_id, asset_id) where is_system_asset do nothing;
end; $$;

create function private.seed_store_assets_after_treasury_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_family_store_assets(new.family_id);
  return new;
end; $$;
create trigger seed_store_assets_after_treasury_insert after insert on public.guild_treasuries
for each row execute function private.seed_store_assets_after_treasury_insert();

revoke all on function private.default_store_asset_price(bigint) from public, anon, authenticated;
revoke all on function private.seed_family_store_assets(uuid) from public, anon, authenticated;
revoke all on function private.seed_store_assets_after_treasury_insert() from public, anon, authenticated;

-- 全種類の初期陳列でお知らせが29件届かないよう、通常商品の変更だけを通知する。
drop trigger notify_store_item_change_after_write on public.store_items;
create trigger notify_store_item_change_after_write after insert or update of price, stock, is_active on public.store_items
for each row when (new.asset_id is null) execute function private.notify_store_item_change();
