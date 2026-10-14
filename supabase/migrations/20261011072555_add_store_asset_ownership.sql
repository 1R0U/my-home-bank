-- Issue #225: 販売するアセットの種別と所有数。見た目はアプリのカタログに残す。
create table public.store_assets (
  asset_id text primary key,
  kind text not null check (kind in ('wearable', 'decoration'))
);
alter table public.store_assets enable row level security;
create policy store_assets_select_authenticated on public.store_assets for select to authenticated using (true);
create policy store_assets_active_child_session on public.store_assets as restrictive for all to authenticated
  using ((select public.current_child_session_is_valid()))
  with check ((select public.current_child_session_is_valid()));
revoke all on public.store_assets from anon, authenticated;
grant select on public.store_assets to authenticated;

insert into public.store_assets(asset_id, kind) values
('decoration-bush', 'decoration'),
('decoration-bush-berry', 'decoration'),
('decoration-bush-tall', 'decoration'),
('decoration-bush-wide', 'decoration'),
('decoration-flowerbed', 'decoration'),
('decoration-grass', 'decoration'),
('decoration-grass-flower', 'decoration'),
('decoration-grass-tall', 'decoration'),
('decoration-grass-wide', 'decoration'),
('decoration-hanger-rack', 'decoration'),
('decoration-lamp', 'decoration'),
('decoration-rock', 'decoration'),
('decoration-rock-flat', 'decoration'),
('decoration-rock-pile', 'decoration'),
('decoration-rock-tall', 'decoration'),
('decoration-tree', 'decoration'),
('decoration-tree-pine', 'decoration'),
('decoration-tree-tall', 'decoration'),
('decoration-tree-young', 'decoration'),
('wearable-glasses', 'wearable'),
('wearable-hat', 'wearable'),
('wearable-cap', 'wearable'),
('wearable-crown', 'wearable'),
('wearable-straw-hat', 'wearable'),
('wearable-santa-hat', 'wearable'),
('wearable-knit-hat', 'wearable'),
('wearable-sunglasses', 'wearable'),
('wearable-eyepatch', 'wearable'),
('wearable-mustache', 'wearable');

alter table public.store_items add column asset_id text references public.store_assets(asset_id);
alter table public.owned_items add column quantity integer not null default 1 check (quantity > 0);
grant insert (asset_id) on public.store_items to authenticated;
create index placed_decorations_user_asset_idx on public.placed_decorations(user_id, asset_id);

comment on column public.store_items.asset_id is '通常商品はNULL。購入で所有に加える着せ替え品・装飾品のアセットID';
comment on column public.owned_items.quantity is '配置済みを含む所有総数。着せ替え品は1個、装飾品は複数個';
