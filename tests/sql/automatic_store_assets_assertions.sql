-- Issue #225: CIの一時DB専用。初期金庫に基づく全種類の自動陳列を検証する。
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_label text, p_state text default '42501')
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then
    if sqlstate <> p_state then raise exception '想定外の拒否理由: %（%）', p_label, sqlstate; end if;
    return;
  end;
  raise exception '拒否されるはずが成功: %', p_label;
end; $$;
select pg_temp.assert(private.default_store_asset_price(10000) = 50, '初期金庫1万golなら50gol');
select pg_temp.assert(private.default_store_asset_price(20000) = 100, '初期金庫に比例する');
select pg_temp.assert(private.default_store_asset_price(10100) = 51, '端数は四捨五入');
select pg_temp.assert(private.default_store_asset_price(0) = 1 and private.default_store_asset_price(1) = 1, '最低1gol');
select pg_temp.assert(private.default_store_asset_price(9007199254740991) = 45035996273705, '安全整数上限でも計算が正確');

insert into public.families(id, name) values ('22510000-0000-4000-8000-000000000001', '自動陳列家族');
insert into public.users(id, family_id, name, role, balance) values
  ('22510000-0000-4000-8000-000000000011', '22510000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('22510000-0000-4000-8000-000000000012', '22510000-0000-4000-8000-000000000001', '子', 'child', 200);
insert into public.guild_treasuries(family_id, balance, initial_supply, total_supply)
values ('22510000-0000-4000-8000-000000000001', 9800, 10000, 10000);
select pg_temp.assert((select count(*) = (select count(*) from public.store_assets) and bool_and(price = 50 and requested_by is null and stock = public.store_unlimited_stock())
  from public.store_items where family_id = '22510000-0000-4000-8000-000000000001' and is_system_asset), '家庭作成時点で全種類が基準価格50gol・無制限で並ぶ');
select pg_temp.assert((select count(*) = 0 from public.notifications where user_id = '22510000-0000-4000-8000-000000000012'), '初期陳列の通知を29件作らない');
update public.guild_treasuries set balance = 12000, total_supply = 12200
where family_id = '22510000-0000-4000-8000-000000000001';
select private.seed_family_store_assets('22510000-0000-4000-8000-000000000001');
select pg_temp.assert((select count(*) = (select count(*) from public.store_assets) and bool_and(price = 50)
  from public.store_items where family_id = '22510000-0000-4000-8000-000000000001' and is_system_asset), '再実行・現在残高・追加発行で重複や値段変更が起きない');

-- 旧商品と既存の持ち物を残したまま、既存家庭を補完できること。
insert into public.store_items(id, family_id, requested_by, title, description, price, stock, asset_id) values
 ('22510000-0000-4000-8000-000000000031', '22510000-0000-4000-8000-000000000001', '22510000-0000-4000-8000-000000000011', '旧キャップ', '', 1, 999999, 'wearable-cap'),
 ('22510000-0000-4000-8000-000000000032', '22510000-0000-4000-8000-000000000001', '22510000-0000-4000-8000-000000000011', '通常商品', '', 20, 999999, null);
insert into public.owned_items(user_id, asset_id, quantity) values ('22510000-0000-4000-8000-000000000012', 'wearable-cap', 1);
\ir ../../supabase/migrations/20261011113832_backfill_automatic_store_assets.sql
select pg_temp.assert((select not is_active and price = 1 from public.store_items where id = '22510000-0000-4000-8000-000000000031'), '旧商品は削除せず販売停止し履歴価格を残す');
select pg_temp.assert((select is_active and price = 20 from public.store_items where id = '22510000-0000-4000-8000-000000000032'), '通常商品を変更しない');
select pg_temp.assert((select quantity = 1 from public.owned_items where user_id = '22510000-0000-4000-8000-000000000012' and asset_id = 'wearable-cap'), '既存の持ち物を保持');

insert into public.economy_monthly_snapshots(family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis)
values ('22510000-0000-4000-8000-000000000001', private.family_calendar_month(now()), 200, 200, 100, '{}'::jsonb);
select set_config('request.jwt.claim.sub', '22510000-0000-4000-8000-000000000011', true);
set local role authenticated;
select pg_temp.assert_rejected($q$update public.store_items set price = 1 where is_system_asset$q$, '親も自動商品の価格を変更できない');
select pg_temp.assert_rejected($q$select private.seed_family_store_assets('22510000-0000-4000-8000-000000000001')$q$, 'アプリから自動陳列関数を呼べない');
select pg_temp.assert_rejected($q$insert into public.store_items(family_id, requested_by, title, description, price, stock, is_system_asset)
values ('22510000-0000-4000-8000-000000000001', '22510000-0000-4000-8000-000000000011', '偽の自動商品', '', 1, 999999, true)$q$, '親から自動商品を偽装して追加できない');
reset role;
select set_config('request.jwt.claim.sub', '22510000-0000-4000-8000-000000000012', true);
set local role authenticated;
select pg_temp.assert((select count(*) = (select count(*) from public.store_assets) from jsonb_array_elements(public.get_current_store_catalog()->'items') i where (i->>'is_system_asset')::boolean), '子供の棚にも全種類が並ぶ');
select public.purchase_store_item('22510000-0000-4000-8000-000000000012',
  (select id from public.store_items where asset_id = 'decoration-bush' and is_system_asset), 'automatic-bush', 50);
select pg_temp.assert((select balance = 150 from public.users where id = auth.uid()), '自動商品も通常の決済で50gol支払う');
select pg_temp.assert((select quantity = 1 from public.owned_items where asset_id = 'decoration-bush'), '決済と所有付与が連動');
reset role;
rollback;
