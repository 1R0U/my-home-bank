-- PR #116: ストア機能（purchase_store_item）の動作を検証する ------------------
--
-- supabase/migrations/*.sql をすべて適用した直後の空のDBに対して実行する。
-- 失敗した時点で exception を投げ、CIのジョブを落とす。
--
-- レビュー指摘（PR #116）: purchase_store_item の残高チェック・在庫減算・
-- 台帳記帳は金額に直結するロジックだが、既存テスト（tests/storeService.test.mjs 等）
-- は client.rpc() をモックしているだけで、このSQL自体は一度も実行されていなかった。
-- tests/sql/assertions.sql と同じ方針（pg_temp.assert ヘルパーを使った実行テスト）で
-- カバーする。assertions.sql 本体に含めないのは、Store機能が独立した関心事のため
-- （tests/sql/treasury_assertions.sql が別ファイルになっているのと同じ考え方）。

\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  %（拒否された: %）', p_label, replace(sqlerrm, E'\n', ' ');
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

\echo '=== 検証用の利用者とアイテムを用意する ==='

insert into users (id, name, role, balance) values
  ('88888888-8888-8888-8888-888888888888', '購入検証用の子', 'child', 100);

insert into store_items (id, title, description, price, stock) values
  ('99999999-9999-9999-9999-999999999999', '検証用アイテム', '説明', 30, 5),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '無制限在庫アイテム', '説明', 10, 999999),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '在庫切れアイテム', '説明', 10, 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '高額アイテム', '説明', 9999, 5);

\echo '=== 1. 購入すると在庫が減り、残高が減り、台帳に記帳される ==='

select purchase_store_item(
  '99999999-9999-9999-9999-999999999999',
  '88888888-8888-8888-8888-888888888888');

do $$
declare
  v_stock numeric;
  v_balance numeric;
  v_count integer;
  v_amount integer;
begin
  select stock into v_stock from store_items
  where id = '99999999-9999-9999-9999-999999999999';
  perform pg_temp.assert(v_stock = 4, format('在庫が5から4に減る（実際: %s）', v_stock));

  select balance into v_balance from users
  where id = '88888888-8888-8888-8888-888888888888';
  perform pg_temp.assert(v_balance = 70, format('残高が100から70に減る（実際: %s）', v_balance));

  select count(*), max(amount) into v_count, v_amount
  from transactions
  where user_id = '88888888-8888-8888-8888-888888888888' and type = 'store_purchase';
  perform pg_temp.assert(
    v_count = 1 and v_amount = -30,
    format('台帳に store_purchase が-30で1件だけ記帳される（実際: %s件, %s）', v_count, v_amount)
  );
end;
$$;

\echo '=== 2. 無制限在庫アイテムは在庫が減らない ==='

select purchase_store_item(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '88888888-8888-8888-8888-888888888888');

do $$
declare
  v_stock numeric;
begin
  select stock into v_stock from store_items
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(
    v_stock = 999999,
    format('無制限在庫（999999）は購入しても減らない（実際: %s）', v_stock)
  );
end;
$$;

\echo '=== 3. 拒否されるべき購入 ==='

select pg_temp.assert_rejected(
  format('select purchase_store_item(%L, %L)',
         'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
         '88888888-8888-8888-8888-888888888888'),
  '在庫切れアイテムの購入');

select pg_temp.assert_rejected(
  format('select purchase_store_item(%L, %L)',
         'cccccccc-cccc-cccc-cccc-cccccccccccc',
         '88888888-8888-8888-8888-888888888888'),
  '残高を超える高額アイテムの購入');

select pg_temp.assert_rejected(
  format('select purchase_store_item(%L, %L)',
         '00000000-0000-0000-0000-000000000000',
         '88888888-8888-8888-8888-888888888888'),
  '存在しないアイテムの購入');

select pg_temp.assert_rejected(
  format('select purchase_store_item(%L, %L)',
         '99999999-9999-9999-9999-999999999999',
         '00000000-0000-0000-0000-000000000000'),
  '存在しない利用者による購入');

-- stock が NULL のデータ不整合ガード（実運用では起こらないはずの想定だが、
-- purchase_store_item 自身がこのケースを明示的に弾いているため確かめる）
do $$
begin
  insert into store_items (id, title, description, price, stock)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'stockがNULLのアイテム', '説明', 10, null);
end;
$$;

select pg_temp.assert_rejected(
  format('select purchase_store_item(%L, %L)',
         'dddddddd-dddd-dddd-dddd-dddddddddddd',
         '88888888-8888-8888-8888-888888888888'),
  'stockがNULLのアイテムの購入');

\echo '=== 4. 拒否された購入で在庫・残高・台帳が変わっていないか ==='

do $$
declare
  v_balance numeric;
  v_tx_count integer;
  v_stock_out_of_stock numeric;
  v_stock_expensive numeric;
begin
  select balance into v_balance from users
  where id = '88888888-8888-8888-8888-888888888888';
  perform pg_temp.assert(v_balance = 70, format('拒否された購入で残高は70のまま（実際: %s）', v_balance));

  select count(*) into v_tx_count
  from transactions where user_id = '88888888-8888-8888-8888-888888888888';
  perform pg_temp.assert(
    v_tx_count = 1,
    format('拒否された購入で台帳の件数は1件のまま（実際: %s件）', v_tx_count)
  );

  select stock into v_stock_out_of_stock from store_items
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  perform pg_temp.assert(v_stock_out_of_stock = 0, '在庫切れアイテムの在庫は0のまま');

  select stock into v_stock_expensive from store_items
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  perform pg_temp.assert(v_stock_expensive = 5, '高額アイテムの在庫は5のまま（購入されていない）');
end;
$$;

\echo '=== すべての検証を通過しました ==='
