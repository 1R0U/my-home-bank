-- Issue #506: CIの一時DB専用。本番では実行しない。
-- 家の中の家具をしまう（store_house_furniture）と、家具の配置の書き込み権限を確かめる。
-- 町に最初からある飾り（Issue #509）も同じ仕組みなので、ここで確かめる。
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_label text, p_state text default null)
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception '想定外の拒否理由: %（期待: %、実際: %）', p_label, p_state, sqlstate;
    end if;
    return;
  end;
  raise exception '拒否されるはずが成功: %', p_label;
end; $$;

insert into public.families(id, name) values ('50600000-0000-4000-8000-000000000001', '家具検証家族');
insert into public.users(id, family_id, name, role, balance) values
  ('50600000-0000-4000-8000-000000000011', '50600000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('50600000-0000-4000-8000-000000000012', '50600000-0000-4000-8000-000000000001', '子', 'child', 1000),
  ('50600000-0000-4000-8000-000000000013', '50600000-0000-4000-8000-000000000001', '別の子', 'child', 1000);
-- 金庫を作ると、ソファ・おおきなうえきも含む全種類が自動で並ぶ
insert into public.guild_treasuries(family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values ('50600000-0000-4000-8000-000000000001', 1000, 2000, 2000, 0.2);

select pg_temp.assert(
  (select count(*) = 2 from public.store_items
   where family_id = '50600000-0000-4000-8000-000000000001' and is_system_asset
     and asset_id in ('decoration-sofa', 'decoration-big-plant')),
  'ソファ・おおきなうえきがストアに並ぶ');

select set_config('request.jwt.claim.sub', '50600000-0000-4000-8000-000000000012', true);
set local role authenticated;

-- 動かす（位置と向きの保存）は今までどおりアプリから書ける。ソファ・植木も動かせる
insert into public.house_furniture_layouts(user_id, furniture_id, position_x, position_z, rotation_y)
values (auth.uid(), 'house-sofa', 1.2, -79.55, 0)
on conflict (user_id, furniture_id) do update set position_x = excluded.position_x, position_z = excluded.position_z,
  rotation_y = excluded.rotation_y, user_id = excluded.user_id, furniture_id = excluded.furniture_id;
select pg_temp.assert((select not stored from public.house_furniture_layouts where furniture_id = 'house-sofa'), '動かしただけではしまわない');
select pg_temp.assert_rejected($q$insert into public.house_furniture_layouts(user_id, furniture_id, position_x, position_z)
 values (auth.uid(), 'house-window', 0, 0)$q$, '動かせる家具の一覧に無い家具は保存できない', '23503');

-- しまったかは、アプリから直接は書けない（書けると、しまう → 戻す → しまうで持ち物を増やせる）
select pg_temp.assert_rejected($q$update public.house_furniture_layouts set stored = true where user_id = auth.uid()$q$,
  'stored を直接書き換えられない', '42501');
select pg_temp.assert_rejected($q$insert into public.house_furniture_layouts(user_id, furniture_id, position_x, position_z, stored)
 values (auth.uid(), 'house-plant', 0, 0, true)$q$, 'stored を付けて行を作れない', '42501');
select pg_temp.assert_rejected($q$delete from public.house_furniture_layouts where user_id = auth.uid()$q$, '行は消せない', '42501');

-- しまえない家具・知らない家具はしまえない
select pg_temp.assert_rejected($q$select public.store_house_furniture('house-closet')$q$, 'クローゼットはしまえない');
select pg_temp.assert_rejected($q$select public.store_house_furniture('house-window')$q$, '一覧に無い家具はしまえない');
-- 町の骨組み（建物・道・柵）は一覧に無いので、しまえない・動かせない（Issue #509）
select pg_temp.assert_rejected($q$select public.store_house_furniture('bank-building')$q$, '建物はしまえない');
select pg_temp.assert_rejected($q$select public.store_house_furniture('path-south-0')$q$, '道はしまえない');
select pg_temp.assert_rejected($q$select public.store_house_furniture('fence-west-0')$q$, '柵はしまえない');
select pg_temp.assert_rejected($q$insert into public.house_furniture_layouts(user_id, furniture_id, position_x, position_z)
 values (auth.uid(), 'bank-building', 0, 0)$q$, '建物は動かせない', '23503');

-- ソファをしまうと、しまった印が付き、ソファの装飾が持ち物に1つ入る
select public.store_house_furniture('house-sofa');
select pg_temp.assert((select stored from public.house_furniture_layouts where furniture_id = 'house-sofa'), 'しまった印が付く');
select pg_temp.assert(
  (select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'decoration-sofa'),
  'しまったソファが持ち物に入る');
-- 2回しまっても増えない
select public.store_house_furniture('house-sofa');
select pg_temp.assert(
  (select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'decoration-sofa'),
  '同じ家具を2回しまっても持ち物は増えない');
-- しまったあとに位置を書いても、しまったままになる
update public.house_furniture_layouts set position_x = 2.1 where user_id = auth.uid() and furniture_id = 'house-sofa';
select pg_temp.assert((select stored from public.house_furniture_layouts where furniture_id = 'house-sofa'), '位置を書いてもしまったまま');

-- 動かしていない（行の無い）植木もしまえる
select public.store_house_furniture('house-plant');
select pg_temp.assert((select stored from public.house_furniture_layouts where furniture_id = 'house-plant'), '行の無い家具もしまえる');
select pg_temp.assert(
  (select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'decoration-big-plant'),
  'しまった植木が持ち物に入る');

-- 持ち物に入ったソファは「かざる」で置ける（置ける数は持っている数まで）
insert into public.placed_decorations(user_id, asset_id, position_x, position_z, rotation_y, scale)
values (auth.uid(), 'decoration-sofa', 0.9, 0.9, 0, 1);
select pg_temp.assert_rejected($q$insert into public.placed_decorations(user_id, asset_id, position_x, position_z, rotation_y, scale)
 values (auth.uid(), 'decoration-sofa', 2.7, 0.9, 0, 1)$q$, '持っている数より多くは置けない');

-- 町に最初からある飾りも、動かす・しまうことができる（Issue #509）。
-- 散らした木（scatter-0-1）の見た目は decoration-tree-tall（lib/rpg-hub/mapObjects.ts の TOWN_DECORATION_ASSETS）
insert into public.house_furniture_layouts(user_id, furniture_id, position_x, position_z, rotation_y)
values (auth.uid(), 'tree-north', -5.4, 13.05, 3.14159);
select pg_temp.assert((select not stored from public.house_furniture_layouts where furniture_id = 'tree-north'), '町の木を動かせる');
select public.store_house_furniture('scatter-0-1');
select public.store_house_furniture('scatter-0-1');
select pg_temp.assert((select stored from public.house_furniture_layouts where furniture_id = 'scatter-0-1'), '散らした木をしまえる');
select pg_temp.assert(
  (select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'decoration-tree-tall'),
  'しまった木が同じ見た目の装飾として持ち物に1つだけ入る');
insert into public.placed_decorations(user_id, asset_id, position_x, position_z, rotation_y, scale)
values (auth.uid(), 'decoration-tree-tall', 2.7, 2.7, 0, 1);
select pg_temp.assert(
  (select count(*) = 250 from public.house_furniture_items where furniture_id not like 'house-%' and stored_asset_id is not null),
  '町の飾りは250個すべて、しまったときに入る装飾が決まっている');

-- ほかの子には影響しない
select set_config('request.jwt.claim.sub', '50600000-0000-4000-8000-000000000013', true);
select pg_temp.assert((select count(*) = 0 from public.house_furniture_layouts), '他人の配置は見えない');
select pg_temp.assert((select count(*) = 0 from public.owned_items where asset_id = 'decoration-sofa'), '他人の持ち物は増えない');
select public.store_house_furniture('house-sofa');
select pg_temp.assert(
  (select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'decoration-sofa'),
  '家具は人ごとにしまえる');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_rejected($q$select public.store_house_furniture('house-sofa')$q$, 'ログインしていなければしまえない');
reset role;

-- 補完のマイグレーションは繰り返しても商品を増やさない
\ir ../../supabase/migrations/20261024162420_seed_house_furniture_store_items.sql
select pg_temp.assert(
  (select count(*) = 1 from public.store_items where family_id = '50600000-0000-4000-8000-000000000001' and asset_id = 'decoration-sofa'),
  '補完の再実行で商品が重複しない');
rollback;
