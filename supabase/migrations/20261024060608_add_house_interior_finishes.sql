-- Issue #480: 家の中の装飾を増やし、壁紙・床板をストアで買って替えられるようにする ----
--
-- 【何を足すか】
-- 1. ストアで売るアセットの種類に、壁紙（wallpaper）・床板（flooring）を足す
-- 2. 家具の装飾（いす・つくえ・ほんだな・ラグ・ベッド・うえきばち・ぬいぐるみ・おもちゃばこ・スタンドライト）と、
--    壁紙・床板を販売するアセットに足す
-- 3. 壁紙・床板は着せ替え品と同じく、1人1つまでしか買えないようにする
-- 4. 選んだ壁紙・床板を利用者ごとに保存する house_interior_settings
--
-- 【最初の壁紙・床板】
-- 家に付いている最初の壁紙（wallpaper-plaster）・床板（flooring-wood）は売らない（store_assets に入れない）。
-- house_interior_settings では NULL で表す（行が無いのも同じ意味）。
--
-- 既存の家庭へ商品を並べるのは、次のマイグレーション（seed_house_interior_finish_store_items）で行う。

-- 1. 種類を足す（もとは列の check 制約。名前は既定の store_assets_kind_check）
alter table public.store_assets drop constraint store_assets_kind_check;
alter table public.store_assets add constraint store_assets_kind_check
  check (kind in ('wearable', 'decoration', 'wallpaper', 'flooring'));

-- 2. 販売するアセット。名前はアプリのカタログ（lib/rpg-hub/catalog.ts・houseFinishes.ts）と同じ
insert into public.store_assets(asset_id, kind, display_name) values
('decoration-bookshelf', 'decoration', 'ほんだな'),
('decoration-chair', 'decoration', 'いす'),
('decoration-rug', 'decoration', 'ラグ'),
('decoration-table', 'decoration', 'つくえ'),
('decoration-bed', 'decoration', 'ベッド'),
('decoration-potted-plant', 'decoration', 'うえきばち'),
('decoration-teddy-bear', 'decoration', 'ぬいぐるみ'),
('decoration-toy-box', 'decoration', 'おもちゃばこ'),
('decoration-floor-lamp', 'decoration', 'スタンドライト'),
('wallpaper-wood', 'wallpaper', 'きのいた'),
('wallpaper-brick', 'wallpaper', 'れんが'),
('wallpaper-flower', 'wallpaper', 'はなもよう'),
('flooring-dark-wood', 'flooring', 'こいきのゆか'),
('flooring-stone', 'flooring', 'いしだたみ'),
('flooring-tatami', 'flooring', 'たたみ');

-- 3. 買ったときに所有へ加える。壁紙・床板は着せ替え品と同じく1つまで
create or replace function private.grant_purchased_store_asset()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asset_id text; v_kind text;
begin
  select i.asset_id, a.kind into v_asset_id, v_kind
  from public.store_items i left join public.store_assets a on a.asset_id = i.asset_id
  where i.id = new.related_id;
  if v_asset_id is null then return new; end if;
  if v_kind in ('wearable', 'wallpaper', 'flooring') then
    insert into public.owned_items(user_id, asset_id, quantity)
    values (new.actor_user_id, v_asset_id, 1) on conflict (user_id, asset_id) do nothing;
    if not found then
      raise exception using errcode = 'P0225', message = case v_kind
        when 'wallpaper' then 'この壁紙はすでに持っています'
        when 'flooring' then 'この床板はすでに持っています'
        else 'この着せ替え品はすでに持っています' end;
    end if;
  elsif v_kind = 'decoration' then
    insert into public.owned_items(user_id, asset_id, quantity)
    values (new.actor_user_id, v_asset_id, 1)
    on conflict (user_id, asset_id) do update set quantity = owned_items.quantity + 1;
  else
    raise exception '販売するアセットの種別が不正です';
  end if;
  return new;
end; $$;
revoke all on function private.grant_purchased_store_asset() from public, anon, authenticated;

-- 商品の説明文に壁紙・床板を足す（中身はもとの関数と同じ）
create or replace function private.seed_family_store_assets(p_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_initial_supply bigint;
begin
  select initial_supply into strict v_initial_supply from public.guild_treasuries where family_id = p_family_id;
  insert into public.store_items(family_id, asset_id, title, description, price, stock, requested_by, is_system_asset)
  select p_family_id, asset_id, display_name,
    case kind
      when 'wearable' then '買うと更衣室で装備できます。'
      when 'wallpaper' then '買うと家の「かざる」で壁紙を替えられます。'
      when 'flooring' then '買うと家の「かざる」で床板を替えられます。'
      else '買った数だけ町に配置できます。' end,
    private.default_store_asset_price(v_initial_supply), public.store_unlimited_stock(), null, true
  from public.store_assets
  on conflict (family_id, asset_id) where is_system_asset do nothing;
end; $$;
revoke all on function private.seed_family_store_assets(uuid) from public, anon, authenticated;

-- 4. 選んだ壁紙・床板。置いた装飾・家具の配置と同じく、選んだ人（users.id）ごとに持つ
create table public.house_interior_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  -- NULL は家に付いている最初の壁紙・床板
  wallpaper_id text references public.store_assets (asset_id),
  flooring_id text references public.store_assets (asset_id),
  updated_at timestamptz not null default now()
);

-- 持っている壁紙・床板だけを選べるようにする。種類の取り違え（床板を壁紙の列へ入れる）も断る
create function private.check_house_interior_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.wallpaper_id is not null and not exists (
    select 1 from public.owned_items o
    join public.store_assets a on a.asset_id = o.asset_id and a.kind = 'wallpaper'
    where o.user_id = new.user_id and o.asset_id = new.wallpaper_id
  ) then
    raise exception 'この壁紙を持っていません。ストアで買ってください';
  end if;
  if new.flooring_id is not null and not exists (
    select 1 from public.owned_items o
    join public.store_assets a on a.asset_id = o.asset_id and a.kind = 'flooring'
    where o.user_id = new.user_id and o.asset_id = new.flooring_id
  ) then
    raise exception 'この床板を持っていません。ストアで買ってください';
  end if;
  return new;
end; $$;
revoke all on function private.check_house_interior_ownership() from public, anon, authenticated;
create trigger check_house_interior_ownership before insert or update on public.house_interior_settings
for each row execute function private.check_house_interior_ownership();

alter table public.house_interior_settings enable row level security;

-- 自分の設定だけを読み書きする。消す権限は渡さない（最初の壁紙・床板へ戻すのは NULL を書く）
create policy house_interior_settings_select_self on public.house_interior_settings
for select to authenticated using (user_id = (select auth.uid()));
create policy house_interior_settings_insert_self on public.house_interior_settings
for insert to authenticated with check (user_id = (select auth.uid()));
create policy house_interior_settings_update_self on public.house_interior_settings
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 失効した子供のJWTで読み書きできないようにする（Issue #264 のほかのテーブルと同じ）
create policy house_interior_settings_active_child_session on public.house_interior_settings as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

revoke all on table public.house_interior_settings from anon, authenticated;
grant select, insert, update on table public.house_interior_settings to authenticated;
