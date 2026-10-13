-- Issue #225: 自動陳列の商品を、親が登録する通常商品と区別する。
alter table public.store_assets add column display_name text;
alter table public.store_items add column is_system_asset boolean not null default false;
alter table public.store_items alter column requested_by drop not null;

-- 既存行はすべてfalseかつ登録者あり。既存の重複商品を推測で削除・統合しない。
alter table public.store_items add constraint store_items_system_asset_source_valid check (
  (is_system_asset and asset_id is not null and requested_by is null)
  or (not is_system_asset and requested_by is not null)
);
create unique index store_items_system_family_asset_unique
  on public.store_items(family_id, asset_id) where is_system_asset;

-- 旧クライアントからも着せ替え・装飾を手動登録できないようにする。
alter policy store_items_insert_parent on public.store_items with check (
  family_id = public.current_user_family_id()
  and requested_by = auth.uid() and asset_id is null and not is_system_asset
  and exists (select 1 from public.users where id = auth.uid() and role = 'parent')
);
comment on column public.store_items.is_system_asset is '初期金庫額に基づく価格で全種類を自動陳列する商品';
