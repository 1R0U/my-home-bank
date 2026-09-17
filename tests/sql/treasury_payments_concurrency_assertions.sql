-- 並行再送が1回分だけ決済され、同じ取引IDを返した後の状態を検証する。
\set ON_ERROR_STOP on

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_stock bigint;
  v_economy_count integer;
  v_legacy_count integer;
begin
  select balance into v_wallet
  from public.users
  where id = 'c0000000-0000-4000-8000-000000000012';

  select balance into v_treasury
  from public.guild_treasuries
  where family_id = 'c0000000-0000-4000-8000-000000000001';

  select stock into v_stock
  from public.store_items
  where id = 'c0000000-0000-4000-8000-000000000031';

  select count(*) into v_economy_count
  from public.economy_transactions
  where idempotency_key = 'test-concurrent-store-purchase';

  select count(*) into v_legacy_count
  from public.transactions
  where user_id = 'c0000000-0000-4000-8000-000000000012'
    and type = 'store_purchase'
    and amount = -100;

  if v_wallet <> 0
    or v_treasury <> 1100
    or v_stock <> 0
    or v_economy_count <> 1
    or v_legacy_count <> 1 then
    raise exception '同一キーの並行再送で決済または在庫が重複更新されました';
  end if;
end;
$$;

drop trigger test_delay_concurrent_store_purchase on public.economy_transactions;
drop function public.test_delay_concurrent_store_purchase();
