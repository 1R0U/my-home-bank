-- Issue #164: 物価指数を反映したストア表示価格・決済額・価格履歴を検証する。
\set ON_ERROR_STOP on

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
end;
$$;

select pg_temp.assert(private.store_sale_price(200, 95) = 190, '指数95の販売価格');
select pg_temp.assert(private.store_sale_price(200, 100) = 200, '指数100の販売価格');
select pg_temp.assert(private.store_sale_price(200, 105) = 210, '指数105の販売価格');
select pg_temp.assert(private.store_sale_price(200, 110) = 220, '指数110の販売価格');
select pg_temp.assert(private.store_sale_price(101, 105) = 110, '端数を最寄り10 golへ四捨五入する');
select pg_temp.assert(private.store_sale_price(1, 95) = 10, '販売価格は最低10 golとする');

select pg_temp.assert(
  not has_function_privilege('anon', 'public.get_current_store_catalog()', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_current_store_catalog()', 'EXECUTE'),
  '商品価格RPCは認証済み利用者だけが実行できる'
);

insert into public.families (id, name) values
  ('16400000-0000-4000-8000-000000000001', '物価反映検証家族'),
  ('16400000-0000-4000-8000-000000000002', '別の物価反映検証家族');

insert into public.users (id, family_id, name, role, balance) values
  ('16400000-0000-4000-8000-000000000011', '16400000-0000-4000-8000-000000000001', '検証用の親', 'parent', 0),
  ('16400000-0000-4000-8000-000000000012', '16400000-0000-4000-8000-000000000001', '検証用の子', 'child', 1000),
  ('16400000-0000-4000-8000-000000000013', '16400000-0000-4000-8000-000000000002', '別家庭の親', 'parent', 0);

insert into public.guild_treasuries (
  family_id, balance, initial_supply, total_supply, minimum_reserve_rate
) values
(
  '16400000-0000-4000-8000-000000000001', 1000, 2000, 2000, 0.2000
);

insert into public.economy_monthly_snapshots (
  family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis
) values (
  '16400000-0000-4000-8000-000000000001',
  private.family_calendar_month(now()),
  1000, 1000, 105, '{"source":"store-price-test"}'::jsonb
);

insert into public.store_items (
  id, family_id, title, description, image_url, price, stock, requested_by
) values (
  '16400000-0000-4000-8000-000000000021',
  '16400000-0000-4000-8000-000000000001',
  '物価反映商品', '', '', 120, 2,
  '16400000-0000-4000-8000-000000000011'
),
(
  '16400000-0000-4000-8000-000000000022',
  '16400000-0000-4000-8000-000000000002',
  '別家庭の商品', '', '', 999, 1,
  '16400000-0000-4000-8000-000000000013'
);

select set_config('request.jwt.claim.sub', '16400000-0000-4000-8000-000000000012', true);

do $$
declare
  v_catalog jsonb;
begin
  v_catalog := public.get_current_store_catalog();
  perform pg_temp.assert((v_catalog->>'price_index')::int = 105, '一覧が今月の指数105を返す');
  perform pg_temp.assert(jsonb_array_length(v_catalog->'items') = 1, '自分の家庭の商品だけを返す');
  perform pg_temp.assert((v_catalog->'items'->0->>'base_price')::bigint = 120, '基準価格を返す');
  perform pg_temp.assert((v_catalog->'items'->0->>'sale_price')::bigint = 130, '表示価格を10 gol単位で返す');
end;
$$;

select public.purchase_store_item(
  '16400000-0000-4000-8000-000000000012',
  '16400000-0000-4000-8000-000000000021',
  'issue-164-price-purchase'
);

select pg_temp.assert(
  (select balance = 870 from public.users where id = '16400000-0000-4000-8000-000000000012')
    and (select balance = 1130 from public.guild_treasuries where family_id = '16400000-0000-4000-8000-000000000001')
    and (select stock = 1 from public.store_items where id = '16400000-0000-4000-8000-000000000021'),
  '表示と同じ130 golで決済し、在庫を1つ減らす'
);

select pg_temp.assert(
  exists (
    select 1
    from public.economy_transactions
    where idempotency_key = 'issue-164-price-purchase'
      and amount = 130
      and store_base_price = 120
      and store_price_index = 105
      and store_sale_price = 130
  ),
  '購入履歴へ基準価格・適用指数・実売価格を保存する'
);

select pg_temp.assert(
  exists (
    select 1
    from public.transactions
    where user_id = '16400000-0000-4000-8000-000000000012'
      and type = 'store_purchase'
      and amount = -130
  ),
  '画面用履歴にも実売価格を記帳する'
);

-- 同じキーの再送時は価格を再適用せず、在庫・残高・履歴を二重更新しない。
select public.purchase_store_item(
  '16400000-0000-4000-8000-000000000012',
  '16400000-0000-4000-8000-000000000021',
  'issue-164-price-purchase'
);

select pg_temp.assert(
  (select balance = 870 from public.users where id = '16400000-0000-4000-8000-000000000012')
    and (select stock = 1 from public.store_items where id = '16400000-0000-4000-8000-000000000021')
    and (select count(*) = 1 from public.economy_transactions where idempotency_key = 'issue-164-price-purchase'),
  '購入再送は1回分だけ反映する'
);

rollback;
