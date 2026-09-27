-- 並行購入テストが後続のDB検証へ状態を持ち越さないよう、専用オブジェクトとデータを削除する。
\set ON_ERROR_STOP on

drop trigger if exists test_delay_concurrent_store_purchase
  on public.economy_transactions;
drop function if exists public.test_delay_concurrent_store_purchase();

delete from public.transactions
where user_id = 'c0000000-0000-4000-8000-000000000012';

delete from public.economy_transactions
where family_id = 'c0000000-0000-4000-8000-000000000001';

delete from public.store_items
where family_id = 'c0000000-0000-4000-8000-000000000001';

delete from public.guild_treasuries
where family_id = 'c0000000-0000-4000-8000-000000000001';

delete from public.users
where family_id = 'c0000000-0000-4000-8000-000000000001';

delete from public.families
where id = 'c0000000-0000-4000-8000-000000000001';
