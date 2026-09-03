-- Issue #64: ストア機能をSupabaseに繋ぐ ------------------------------------

-- 1. store_items.requested_by 列を追加（アイテムを追加した人。誤発注防止のため記録）
alter table store_items
  add column if not exists requested_by uuid references users(id);

-- 2. store_items.image_url 列を追加（画像アップロード機能は今回スコープ外のためnull許容）
alter table store_items
  add column if not exists image_url text;

-- 3. 購入関数
--    在庫確認・残高確認・在庫減算・users.balance減算・transactions記帳を
--    1トランザクションで実行する（途中失敗時は全てロールバックされる）。
create or replace function purchase_store_item(p_item_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer;
  v_stock numeric;
  v_title text;
  v_balance numeric;
begin
  -- 対象アイテムを行ロックして取得（在庫の同時購入による競合を防ぐ）
  select price::integer, stock, title
    into v_price, v_stock, v_title
  from store_items
  where id = p_item_id
  for update;

  if v_title is null then
    raise exception 'store item not found: %', p_item_id;
  end if;

  if v_stock <= 0 then
    raise exception 'store item out of stock: %', p_item_id;
  end if;

  select balance into v_balance from users where id = p_user_id for update;

  if v_balance is null then
    raise exception 'user not found: %', p_user_id;
  end if;

  if v_balance < v_price then
    raise exception 'insufficient balance for user % (has %, needs %)', p_user_id, v_balance, v_price;
  end if;

  update store_items
    set stock = stock - 1
    where id = p_item_id;

  update users
    set balance = balance - v_price
    where id = p_user_id;

  insert into transactions (user_id, type, description, amount)
  values (p_user_id, 'store_purchase', v_title, -v_price);
end;
$$;

-- 注意（既知の制約・Phase 2で対応予定、Issue #63と同様）:
-- purchase_store_item は security definer で実行されるが、auth.uid() と
-- p_user_id の突き合わせは行っていない。Supabase Authと未連携（モックログインのみ）
-- のための一時的な割り切りで、RLS導入（Phase 2）と合わせて別途対応する。
