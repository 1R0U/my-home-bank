-- Issue #225: CIの一時DB専用。本番では実行しない。
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_label text)
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then return; end;
  raise exception '拒否されるはずが成功: %', p_label;
end; $$;

insert into public.families(id, name) values
  ('22500000-0000-4000-8000-000000000001', '所有検証家族'),
  ('22500000-0000-4000-8000-000000000002', '別の所有検証家族');
insert into public.users(id, family_id, name, role, balance) values
  ('22500000-0000-4000-8000-000000000011', '22500000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000001', '子', 'child', 1000),
  ('22500000-0000-4000-8000-000000000013', '22500000-0000-4000-8000-000000000001', '残高なし', 'child', 0),
  ('22500000-0000-4000-8000-000000000021', '22500000-0000-4000-8000-000000000002', '別家庭の親', 'parent', 0);
insert into public.guild_treasuries(family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values ('22500000-0000-4000-8000-000000000001', 1000, 2000, 2000, 0.2);
insert into public.economy_monthly_snapshots(family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis)
values ('22500000-0000-4000-8000-000000000001', private.family_calendar_month(now()), 1000, 1000, 100, '{}'::jsonb);

-- 新しい列のINSERT権限も親の実ロールで確認する。
insert into public.store_items(id, family_id, requested_by, title, description, price, stock, asset_id) values
  ('22500000-0000-4000-8000-000000000031', '22500000-0000-4000-8000-000000000001', '22500000-0000-4000-8000-000000000011', 'ぼうし', '', 100, 10, 'wearable-hat'),
  ('22500000-0000-4000-8000-000000000032', '22500000-0000-4000-8000-000000000001', '22500000-0000-4000-8000-000000000011', 'き', '', 50, 10, 'decoration-tree'),
  ('22500000-0000-4000-8000-000000000033', '22500000-0000-4000-8000-000000000001', '22500000-0000-4000-8000-000000000011', 'おやつ', '', 20, 10, null);
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000011', true);
set local role authenticated;
insert into public.store_items(family_id, requested_by, title, description, price, stock, asset_id)
values ('22500000-0000-4000-8000-000000000001', '22500000-0000-4000-8000-000000000011', '親が追加したがんたい', '', 100, 10, 'wearable-eyepatch');
select pg_temp.assert_rejected($q$insert into public.store_assets values ('unknown', 'wearable')$q$, 'カタログを利用者が増やせない');
select pg_temp.assert_rejected($q$insert into public.store_items(family_id, requested_by, title, price, stock, asset_id)
 values ('22500000-0000-4000-8000-000000000001', '22500000-0000-4000-8000-000000000011', '不明', 10, 1, 'unknown')$q$, '未知のアセットを売れない');

select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000012', true);
select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000031', '225-wearable', 100);
select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000031', '225-wearable', 100);
select pg_temp.assert((select quantity = 1 from public.owned_items where asset_id = 'wearable-hat'), '再送でも所有は1個');
select pg_temp.assert((select balance = 900 from public.users where id = auth.uid()), '再送で二重に支払わない');
select pg_temp.assert_rejected($q$select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000031', '225-wearable-again', 100)$q$, '着せ替え品を別操作で二重購入できない');
select pg_temp.assert((select balance = 900 from public.users where id = auth.uid()), '重複所有の拒否で財布は変わらない');
select pg_temp.assert((select stock = 9 from public.store_items where id = '22500000-0000-4000-8000-000000000031'), '拒否で在庫も減らない');
select pg_temp.assert((select count(*) = 1 from public.transactions where user_id = auth.uid() and type = 'store_purchase'), '拒否で画面用台帳を増やさない');
select pg_temp.assert((select count(*) = 1 from public.economy_transactions where actor_user_id = auth.uid() and type = 'store_purchase'), '拒否で経済台帳を増やさない');
select pg_temp.assert((select balance = 1100 from public.guild_treasuries), '拒否で金庫も増えない');
insert into public.equipped_items(user_id, asset_id, slot) values ('22500000-0000-4000-8000-000000000012', 'wearable-hat', 'head');

select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000032', '225-tree-1', 50);
select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000032', '225-tree-2', 50);
select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000032', '225-tree-2', 50);
select pg_temp.assert((select quantity = 2 from public.owned_items where asset_id = 'decoration-tree'), '装飾は別購入で2個、再送では増えない');
select pg_temp.assert((select balance = 800 from public.users where id = auth.uid()), '装飾2個分だけ決済');
insert into public.placed_decorations(id, user_id, asset_id, position_x, position_z) values
  ('22500000-0000-4000-8000-000000000041', '22500000-0000-4000-8000-000000000012', 'decoration-tree', 0, 0),
  ('22500000-0000-4000-8000-000000000042', '22500000-0000-4000-8000-000000000012', 'decoration-tree', 2, 2);
select pg_temp.assert_rejected($q$insert into public.placed_decorations(user_id, asset_id, position_x, position_z)
 values ('22500000-0000-4000-8000-000000000012', 'decoration-tree', 4, 4)$q$, '買った数を超えて置けない');
delete from public.placed_decorations where id = '22500000-0000-4000-8000-000000000041';
insert into public.placed_decorations(user_id, asset_id, position_x, position_z)
values ('22500000-0000-4000-8000-000000000012', 'decoration-tree', 4, 4);
select pg_temp.assert((select quantity = 2 from public.owned_items where asset_id = 'decoration-tree'), 'しまって置き直しても所有総数は変わらない');
select pg_temp.assert_rejected($q$insert into public.placed_decorations(user_id, asset_id, position_x, position_z)
 values ('22500000-0000-4000-8000-000000000012', 'decoration-rock', 4, 4)$q$, '未購入の装飾を置けない');
select pg_temp.assert_rejected($q$update public.owned_items set quantity = 999 where asset_id = 'decoration-tree'$q$, '自分で所有数を増やせない');
select pg_temp.assert_rejected($q$insert into public.owned_items(user_id, asset_id) values ('22500000-0000-4000-8000-000000000012', 'decoration-rock')$q$, '直接の所有付与を拒否');
select pg_temp.assert((public.get_current_store_catalog()->'items' @> '[{"asset_id":"decoration-tree","asset_kind":"decoration","owned_quantity":2}]'::jsonb), '一覧で本人の所有数と種別を返す');

select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000033', '225-normal', 20);
select pg_temp.assert((select count(*) = 2 from public.owned_items), '通常商品は所有に加えない');
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000013', true);
select pg_temp.assert_rejected($q$select public.purchase_store_item('22500000-0000-4000-8000-000000000013', '22500000-0000-4000-8000-000000000032', '225-no-balance', 50)$q$, '残高不足を拒否');
select pg_temp.assert((select count(*) = 0 from public.owned_items), '残高不足なら所有を付与しない');
select pg_temp.assert((public.get_current_store_catalog()->'items' @> '[{"asset_id":"decoration-tree","owned_quantity":0}]'::jsonb), 'ほかの子の所有数を返さない');
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected($q$select public.purchase_store_item('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000032', '225-other-user', 50)$q$, '他人として購入できない');
reset role;
-- 導入前の配置を再現し、補完を繰り返しても既存の所有数を失わないことを確認する。
alter table public.placed_decorations disable trigger check_decoration_ownership;
insert into public.placed_decorations(user_id, asset_id, position_x, position_z) values
  ('22500000-0000-4000-8000-000000000013', 'decoration-rock', 0, 0),
  ('22500000-0000-4000-8000-000000000013', 'decoration-rock', 2, 2);
alter table public.placed_decorations enable trigger check_decoration_ownership;
\ir ../../supabase/migrations/20261011072556_backfill_owned_decorations.sql
select pg_temp.assert((select quantity = 2 from public.owned_items where user_id = '22500000-0000-4000-8000-000000000013' and asset_id = 'decoration-rock'), '既存の配置2個を所有として引き継ぐ');
update public.owned_items set quantity = 3 where user_id = '22500000-0000-4000-8000-000000000013' and asset_id = 'decoration-rock';
\ir ../../supabase/migrations/20261011072556_backfill_owned_decorations.sql
select pg_temp.assert((select quantity = 3 from public.owned_items where user_id = '22500000-0000-4000-8000-000000000013' and asset_id = 'decoration-rock'), '補完の再実行で配置より多い所有を減らさない');
select pg_temp.assert((select quantity = 1 from public.owned_items where user_id = '22500000-0000-4000-8000-000000000012' and asset_id = 'wearable-hat'), '装飾の補完が着せ替えの所有を変えない');
rollback;
