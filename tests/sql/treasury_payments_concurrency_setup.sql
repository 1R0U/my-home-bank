-- 同じ冪等キーの購入を並行実行するための検証データを用意する。
\set ON_ERROR_STOP on

insert into public.families (id, name)
values ('c0000000-0000-4000-8000-000000000001', '並行購入検証家族');

insert into public.users (id, family_id, name, role, balance) values
  (
    'c0000000-0000-4000-8000-000000000011',
    'c0000000-0000-4000-8000-000000000001',
    '並行購入検証の親',
    'parent',
    0
  ),
  (
    'c0000000-0000-4000-8000-000000000012',
    'c0000000-0000-4000-8000-000000000001',
    '並行購入検証の子',
    'child',
    100
  );

insert into public.guild_treasuries (
  family_id, balance, initial_supply, total_supply, minimum_reserve_rate
) values (
  'c0000000-0000-4000-8000-000000000001',
  1000,
  1000,
  1100,
  0.2000
);

insert into public.store_items (
  id, family_id, title, description, image_url, price, stock, requested_by
) values (
  'c0000000-0000-4000-8000-000000000031',
  'c0000000-0000-4000-8000-000000000001',
  '並行購入検証商品',
  '',
  '',
  100,
  1,
  'c0000000-0000-4000-8000-000000000012'
);

-- 先行購入の取引作成を遅らせ、後続購入が事前照合を通過して商品ロックを待つ状態にする。
create function public.test_delay_concurrent_store_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key = 'test-concurrent-store-purchase' then
    perform pg_catalog.pg_sleep(10);
  end if;
  return new;
end;
$$;

create trigger test_delay_concurrent_store_purchase
before insert on public.economy_transactions
for each row execute function public.test_delay_concurrent_store_purchase();
