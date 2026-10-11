-- Issue #225: 着せ替え品・装飾品を買って、所有として記録できるかを確認する。
\set ON_ERROR_STOP on
\o /dev/null

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'アサーション失敗: % （想定と違う理由で拒否された: %）', p_label, sqlerrm;
    end if;
    raise notice 'OK  %（拒否された: %）', p_label, sqlerrm;
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

create function pg_temp.owns(p_user_id uuid, p_asset_id text)
returns boolean language sql as $$
  select exists (select 1 from public.owned_items where user_id = p_user_id and asset_id = p_asset_id);
$$;

create function pg_temp.item_id(p_asset_id text)
returns uuid language sql as $$
  select id from public.shop_items where asset_id = p_asset_id;
$$;

-- 品書き --------------------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.shop_items where is_starter) = 13
    and (select count(*) from public.shop_items where not is_starter) = 16,
  '品書きは、最初から持っている品13と、買う品16'
);
select pg_temp.assert(
  not exists (select 1 from public.shop_items where is_starter and price is not null)
    and not exists (select 1 from public.shop_items where not is_starter and price is null),
  '最初から持っている品は値段を持たず、買う品は値段を持つ'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.get_shop_catalog()', 'execute')
    and has_function_privilege('authenticated', 'public.get_shop_catalog()', 'execute')
    and not has_function_privilege('anon', 'public.purchase_shop_item(uuid, text, bigint)', 'execute')
    and has_function_privilege('authenticated', 'public.purchase_shop_item(uuid, text, bigint)', 'execute')
    and not has_function_privilege('authenticated', 'private.purchase_shop_item_unchecked(uuid, uuid, text, bigint)', 'execute')
    and not has_function_privilege('authenticated', 'private.grant_starter_items(uuid)', 'execute'),
  '品書きと購入のRPCはログイン中の利用者だけが呼べ、中の処理は直接呼べない'
);

-- 家庭: 親・子A（1000ゴル）・子B（50ゴル）。物価指数105
insert into public.families (id, name) values
  ('22500000-0000-4000-8000-000000000001', '225家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('22500000-0000-4000-8000-000000000011', '22500000-0000-4000-8000-000000000001', '225の親', 'parent', 0),
  ('22500000-0000-4000-8000-000000000012', '22500000-0000-4000-8000-000000000001', '225の子A', 'child', 1000),
  ('22500000-0000-4000-8000-000000000013', '22500000-0000-4000-8000-000000000001', '225の子B', 'child', 50);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply, minimum_reserve_rate) values
  ('22500000-0000-4000-8000-000000000001', 1000, 2050, 2050, 0.2000);
insert into public.economy_monthly_snapshots
  (family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis) values
  ('22500000-0000-4000-8000-000000000001', private.family_calendar_month(now()), 1000, 1000, 105, '{"source":"shop-test"}'::jsonb);

-- 最初から持っている品を配る ---------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.owned_items where user_id = '22500000-0000-4000-8000-000000000012') = 13
    and pg_temp.owns('22500000-0000-4000-8000-000000000011', 'wearable-hat')
    and pg_temp.owns('22500000-0000-4000-8000-000000000012', 'decoration-tree'),
  '利用者が増えると、最初から持っている品13個が配られる'
);
select pg_temp.assert(
  not pg_temp.owns('22500000-0000-4000-8000-000000000012', 'wearable-straw-hat')
    and not pg_temp.owns('22500000-0000-4000-8000-000000000012', 'decoration-lamp'),
  '買う品は配られない'
);

-- 品書きを見る ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000012', true);

create temporary table catalog_before on commit drop as select public.get_shop_catalog() as c;
select pg_temp.assert(
  (select (c ->> 'price_index')::integer = 105 and jsonb_array_length(c -> 'items') = 16 from catalog_before),
  '品書きは、買う品16を物価指数つきで返す（最初から持っている品は出さない）'
);
select pg_temp.assert(
  exists (
    select 1 from catalog_before, jsonb_array_elements(c -> 'items') as item
    where item ->> 'asset_id' = 'wearable-straw-hat'
      and (item ->> 'base_price')::bigint = 200
      and (item ->> 'sale_price')::bigint = 210
      and (item ->> 'owned')::boolean = false
      and item ->> 'kind' = 'wearable'
  ),
  '販売価格はストアと同じ計算（200ゴル × 105% = 210ゴル）で、まだ持っていない'
);

-- 買う --------------------------------------------------------------------------------------------
select public.purchase_shop_item(pg_temp.item_id('wearable-straw-hat'), 'shop-225-straw', 210);
reset role;

select pg_temp.assert(
  (select balance = 790 from public.users where id = '22500000-0000-4000-8000-000000000012')
    and (select balance = 1210 from public.guild_treasuries where family_id = '22500000-0000-4000-8000-000000000001'),
  '買うと、子供の所持ゴルが210減り、ギルド金庫へ同じ額が入る'
);
select pg_temp.assert(
  pg_temp.owns('22500000-0000-4000-8000-000000000012', 'wearable-straw-hat'),
  '買った品は所有として記録される'
);
select pg_temp.assert(
  exists (
    select 1 from public.economy_transactions
    where idempotency_key = 'shop-225-straw' and type = 'store_purchase' and amount = 210
      and related_type = 'shop_item' and related_id = pg_temp.item_id('wearable-straw-hat')
      and store_base_price = 200 and store_price_index = 105 and store_sale_price = 210
  ) and exists (
    select 1 from public.transactions
    where user_id = '22500000-0000-4000-8000-000000000012'
      and type = 'store_purchase' and description = 'むぎわらぼうし' and amount = -210
  ),
  '台帳と子供の取引履歴に、ストアの購入として記帳される'
);

-- 同じ購入が2回届いても1回ぶん
set local role authenticated;
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000012', true);
select pg_temp.assert(
  public.purchase_shop_item(pg_temp.item_id('wearable-straw-hat'), 'shop-225-straw', 210)
    = (select id from public.economy_transactions where idempotency_key = 'shop-225-straw'),
  '同じキーで届いた再送には、同じ取引IDを返す'
);
reset role;
select pg_temp.assert(
  (select balance = 790 from public.users where id = '22500000-0000-4000-8000-000000000012')
    and (select count(*) = 1 from public.transactions
         where user_id = '22500000-0000-4000-8000-000000000012' and description = 'むぎわらぼうし'),
  '再送では二重に引かれない'
);

-- 買えないとき ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  format($q$select public.purchase_shop_item(%L, 'shop-225-straw-again', 210)$q$, pg_temp.item_id('wearable-straw-hat')),
  'もう持っています',
  'もう持っている品は、別のキーでも買えない'
);
select pg_temp.assert_rejected(
  format($q$select public.purchase_shop_item(%L, 'shop-225-hat', 10)$q$, pg_temp.item_id('wearable-hat')),
  '購入できる品が見つかりません',
  '最初から持っている品は買えない'
);
select pg_temp.assert_rejected(
  format($q$select public.purchase_shop_item(%L, 'shop-225-lamp-old-price', 200)$q$, pg_temp.item_id('decoration-lamp')),
  '価格が変わりました',
  '画面の価格と販売価格が違えば買えない'
);

-- 子B（50ゴル）は残高が足りない
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000013', true);
select pg_temp.assert_rejected(
  format($q$select public.purchase_shop_item(%L, 'shop-225-poor', 210)$q$, pg_temp.item_id('decoration-lamp')),
  'Wallet残高が不足',
  '残高が足りなければ買えない'
);
reset role;
select pg_temp.assert(
  (select balance = 50 from public.users where id = '22500000-0000-4000-8000-000000000013')
    and not pg_temp.owns('22500000-0000-4000-8000-000000000013', 'decoration-lamp')
    and not exists (select 1 from public.economy_transactions where idempotency_key = 'shop-225-poor'),
  '買えなかったときは、所持ゴルも所有も台帳も変わらない'
);

-- 親は買えない
set local role authenticated;
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected(
  format($q$select public.purchase_shop_item(%L, 'shop-225-parent', 210)$q$, pg_temp.item_id('decoration-lamp')),
  '子どもだけ',
  '親は買えない'
);

-- 品書きに買ったものが「持っている」と出る
select set_config('request.jwt.claim.sub', '22500000-0000-4000-8000-000000000012', true);
select pg_temp.assert(
  exists (
    select 1 from jsonb_array_elements(public.get_shop_catalog() -> 'items') as item
    where item ->> 'asset_id' = 'wearable-straw-hat' and (item ->> 'owned')::boolean
  ),
  '買ったあとの品書きでは、その品が「持っている」になる'
);

-- 装飾は持っている種類だけ置ける ---------------------------------------------------------------------
insert into public.placed_decorations (user_id, asset_id, position_x, position_z)
values ('22500000-0000-4000-8000-000000000012', 'decoration-tree', 1, 1);
select pg_temp.assert(true, '最初から持っている装飾は置ける');

select pg_temp.assert_rejected(
  $q$insert into public.placed_decorations (user_id, asset_id, position_x, position_z)
     values ('22500000-0000-4000-8000-000000000012', 'decoration-lamp', 2, 2)$q$,
  'row-level security',
  'まだ買っていない装飾は置けない'
);
select pg_temp.assert_rejected(
  $q$update public.placed_decorations set asset_id = 'decoration-lamp'
     where user_id = '22500000-0000-4000-8000-000000000012'$q$,
  'row-level security',
  '置いた装飾を、持っていない種類に変えることもできない'
);

select public.purchase_shop_item(pg_temp.item_id('decoration-lamp'), 'shop-225-lamp', 210);
insert into public.placed_decorations (user_id, asset_id, position_x, position_z)
values ('22500000-0000-4000-8000-000000000012', 'decoration-lamp', 2, 2),
       ('22500000-0000-4000-8000-000000000012', 'decoration-lamp', 3, 3);
reset role;
select pg_temp.assert(
  (select count(*) = 2 from public.placed_decorations
   where user_id = '22500000-0000-4000-8000-000000000012' and asset_id = 'decoration-lamp'),
  '買った装飾は、今までどおり何個でも置ける'
);

rollback;
