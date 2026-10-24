-- Issue #480: CIの一時DB専用。本番では実行しない。
-- 壁紙・床板の購入（1人1つまで）と、選んだ壁紙・床板の保存（持っている物だけ・本人だけ）を確かめる。
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

insert into public.families(id, name) values ('48000000-0000-4000-8000-000000000001', '内装検証家族');
insert into public.users(id, family_id, name, role, balance) values
  ('48000000-0000-4000-8000-000000000011', '48000000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('48000000-0000-4000-8000-000000000012', '48000000-0000-4000-8000-000000000001', '子', 'child', 1000),
  ('48000000-0000-4000-8000-000000000013', '48000000-0000-4000-8000-000000000001', '別の子', 'child', 1000);
-- 金庫を作ると、壁紙・床板を含む全種類が自動で並ぶ
insert into public.guild_treasuries(family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values ('48000000-0000-4000-8000-000000000001', 1000, 2000, 2000, 0.2);
insert into public.economy_monthly_snapshots(family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis)
values ('48000000-0000-4000-8000-000000000001', private.family_calendar_month(now()), 1000, 1000, 100, '{}'::jsonb);

select pg_temp.assert(
  (select count(*) = 6 from public.store_items i join public.store_assets a using (asset_id)
   where i.family_id = '48000000-0000-4000-8000-000000000001' and i.is_system_asset and a.kind in ('wallpaper', 'flooring')),
  '壁紙3種・床板3種が自動で並ぶ');
select pg_temp.assert(
  not exists (select 1 from public.store_assets where asset_id in ('wallpaper-plaster', 'flooring-wood')),
  '家に付いている最初の壁紙・床板は売らない');
select pg_temp.assert_rejected($q$insert into public.store_assets(asset_id, kind, display_name) values ('ceiling-x', 'ceiling', 'てんじょう')$q$,
  '知らない種類のアセットは足せない', '23514');

select set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-000000000012', true);
set local role authenticated;

-- 持っていない壁紙は選べない
select pg_temp.assert_rejected($q$insert into public.house_interior_settings(user_id, wallpaper_id)
 values ('48000000-0000-4000-8000-000000000012', 'wallpaper-brick')$q$, '買っていない壁紙を選べない');
-- 最初の壁紙・床板（NULL）はいつでも選べる
insert into public.house_interior_settings(user_id) values ('48000000-0000-4000-8000-000000000012');

select public.purchase_store_item('48000000-0000-4000-8000-000000000012',
  (select id from public.store_items where family_id = '48000000-0000-4000-8000-000000000001' and asset_id = 'wallpaper-brick'),
  '480-brick', 10);
select pg_temp.assert((select quantity = 1 from public.owned_items where user_id = auth.uid() and asset_id = 'wallpaper-brick'), '買った壁紙を持つ');
select pg_temp.assert_rejected($q$select public.purchase_store_item('48000000-0000-4000-8000-000000000012',
  (select id from public.store_items where family_id = '48000000-0000-4000-8000-000000000001' and asset_id = 'wallpaper-brick'),
  '480-brick-again', 10)$q$, '壁紙は二重に買えない', 'P0225');
select pg_temp.assert((select balance = 990 from public.users where id = auth.uid()), '二重購入の拒否で財布は変わらない');

update public.house_interior_settings set wallpaper_id = 'wallpaper-brick' where user_id = auth.uid();
select pg_temp.assert((select wallpaper_id = 'wallpaper-brick' from public.house_interior_settings where user_id = auth.uid()), '買った壁紙を選べる');
select pg_temp.assert_rejected($q$update public.house_interior_settings set flooring_id = 'wallpaper-brick' where user_id = auth.uid()$q$,
  '壁紙を床板の列に入れられない');
select pg_temp.assert_rejected($q$update public.house_interior_settings set flooring_id = 'decoration-tree' where user_id = auth.uid()$q$,
  '装飾を床板にできない');
update public.house_interior_settings set wallpaper_id = null where user_id = auth.uid();
select pg_temp.assert((select wallpaper_id is null from public.house_interior_settings where user_id = auth.uid()), '最初の壁紙へ戻せる');
select pg_temp.assert_rejected($q$delete from public.house_interior_settings where user_id = auth.uid()$q$, '行は消せない', '42501');

-- 他人の設定は読めず、書けない
select pg_temp.assert_rejected($q$insert into public.house_interior_settings(user_id) values ('48000000-0000-4000-8000-000000000013')$q$,
  '他人の設定を作れない', '42501');
select set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-000000000013', true);
select pg_temp.assert((select count(*) = 0 from public.house_interior_settings), '他人の設定は見えない');
-- 別の子は壁紙を買っていないので、同じ壁紙は選べない
select pg_temp.assert_rejected($q$insert into public.house_interior_settings(user_id, wallpaper_id)
 values ('48000000-0000-4000-8000-000000000013', 'wallpaper-brick')$q$, 'ほかの子が買った壁紙は選べない');
reset role;

-- 補完のマイグレーションは繰り返しても商品を増やさない
\ir ../../supabase/migrations/20261024060609_seed_house_interior_finish_store_items.sql
select pg_temp.assert(
  (select count(*) = 1 from public.store_items where family_id = '48000000-0000-4000-8000-000000000001' and asset_id = 'wallpaper-brick'),
  '補完の再実行で商品が重複しない');
rollback;
