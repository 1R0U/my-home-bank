-- Issue #164: 月次物価指数をストアの表示価格と購入処理へ反映する。

-- 購入時点の価格根拠を、後から経済台帳で確認できるようにする。
-- 既存の購入履歴は当時の指数を安全に復元できないためNULLのまま残す。
alter table public.economy_transactions
  add column store_base_price bigint,
  add column store_price_index int,
  add column store_sale_price bigint;

alter table public.economy_transactions
  add constraint economy_transactions_store_price_history_valid
  check (
    num_nonnulls(store_base_price, store_price_index, store_sale_price) = 0
    or (
      num_nonnulls(store_base_price, store_price_index, store_sale_price) = 3
      and
      type = 'store_purchase'
      and store_base_price > 0
      and store_base_price <= 9007199254740991
      and store_price_index in (95, 100, 105, 110)
      and store_sale_price = amount
      and store_sale_price > 0
      and store_sale_price <= 9007199254740991
    )
  );

comment on column public.economy_transactions.store_base_price is
  'ストア購入時の商品基準価格。Issue #164より前の購入とストア以外の取引はNULL';
comment on column public.economy_transactions.store_price_index is
  'ストア購入時に適用した月次物価指数。Issue #164より前の購入とストア以外の取引はNULL';
comment on column public.economy_transactions.store_sale_price is
  'ストア購入時の実売価格。economy_transactions.amountと同額';

-- 基準価格へ物価指数を掛け、最寄りの10 golへ四捨五入する。
-- 安定時（指数100）は既存商品の価格を変えず、基準価格をそのまま返す。
-- 物価変動時は10 gol未満の商品も無料にはせず、販売価格の下限を10 golとする。
create function private.store_sale_price(p_base_price bigint, p_price_index int)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sale_price numeric;
begin
  if p_base_price is null
    or p_base_price <= 0
    or p_base_price > private.safe_integer_max() then
    raise exception '商品の基準価格は1 gol以上の安全な整数で指定してください';
  end if;
  if p_price_index is null or p_price_index not in (95, 100, 105, 110) then
    raise exception '未対応の物価指数です: %', p_price_index;
  end if;

  if p_price_index = 100 then
    return p_base_price;
  end if;

  v_sale_price := greatest(
    10,
    round((p_base_price::numeric * p_price_index) / 1000) * 10
  );

  if v_sale_price > private.safe_integer_max() then
    raise exception '物価反映後の販売価格が安全な整数の上限を超えます';
  end if;

  return v_sale_price::bigint;
end;
$$;

revoke all on function private.store_sale_price(bigint, int)
from public, anon, authenticated;

-- ログイン中の家庭の商品と、今月の販売価格を一度に返す。
-- 商品が0件でもprice_indexを返せるよう、JSONオブジェクトを戻り値にする。
create function public.get_current_store_catalog()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.economy_monthly_snapshots%rowtype;
  v_items jsonb;
begin
  select *
  into v_snapshot
  from public.get_or_create_monthly_price_index();

  select coalesce(
    jsonb_agg(
      to_jsonb(item_row)
      || jsonb_build_object(
        'base_price', item_row.price,
        'price_index', v_snapshot.price_index,
        'sale_price', private.store_sale_price(item_row.price, v_snapshot.price_index)
      )
      order by item_row.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.store_items as item_row
  where item_row.family_id = v_snapshot.family_id
    and item_row.is_active;

  return jsonb_build_object(
    'price_index', v_snapshot.price_index,
    'items', v_items
  );
end;
$$;

revoke all on function public.get_current_store_catalog() from public, anon;
grant execute on function public.get_current_store_catalog() to authenticated;

comment on function public.get_current_store_catalog() is
  'Issue #164: ログイン中の家庭の商品を、今月の物価指数と実売価格付きで返す';

-- 親の商品管理一覧では非公開商品も確認できるようにし、子どもには従来どおり公開商品だけを見せる。
drop policy store_items_select_family on public.store_items;
create policy store_items_select_family
on public.store_items
for select
to authenticated
using (
  family_id = public.current_user_family_id()
  and (
    is_active
    or exists (
      select 1
      from public.users
      where id = auth.uid()
        and role = 'parent'
    )
  )
);

-- 旧クライアントが呼ぶ3引数版は更新案内だけを返す互換窓口として残す。
-- 表示価格を照合できないため、この関数からは決済しない。
create or replace function public.purchase_store_item(
  p_user_id uuid,
  p_store_item_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'アプリを更新してください';
end;
$$;

revoke all on function public.purchase_store_item(uuid, uuid, text) from public, anon;
grant execute on function public.purchase_store_item(uuid, uuid, text) to authenticated;

-- 内部の旧3引数版は外部から呼べないため削除し、4引数版へ置き換える。
drop function private.purchase_store_item_with_treasury_unchecked(uuid, uuid, text);

-- 決済額はロックした商品と保存済み月次指数から再計算し、画面で確認した額とは照合だけ行う。
create function private.purchase_store_item_with_treasury_unchecked(
  p_user_id uuid,
  p_store_item_id uuid,
  p_idempotency_key text,
  p_expected_sale_price bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_role text;
  v_item public.store_items%rowtype;
  v_snapshot public.economy_monthly_snapshots%rowtype;
  v_sale_price bigint;
  v_existing_transaction public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;
  if p_expected_sale_price is null
    or p_expected_sale_price <= 0
    or p_expected_sale_price > private.safe_integer_max() then
    raise exception '有効な表示価格を指定してください';
  end if;

  select family_id, role
  into v_family_id, v_role
  from public.users
  where id = p_user_id;

  if not found or v_family_id is null then
    raise exception '購入者の家庭情報が見つかりません';
  end if;
  if v_role <> 'child' then
    raise exception 'ストア商品を購入できるのは子どもだけです';
  end if;

  -- 完了済みの購入は、価格や商品状態が変わっても同じ取引IDを返す。
  select *
  into v_existing_transaction
  from public.economy_transactions
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_transaction.family_id is distinct from v_family_id
      or v_existing_transaction.actor_user_id is distinct from p_user_id
      or v_existing_transaction.type <> 'store_purchase'
      or v_existing_transaction.from_account_type <> 'wallet'
      or v_existing_transaction.from_user_id is distinct from p_user_id
      or v_existing_transaction.to_account_type <> 'treasury'
      or v_existing_transaction.related_type is distinct from 'store_item'
      or v_existing_transaction.related_id is distinct from p_store_item_id then
      raise exception '同じidempotency_keyが別のストア購入に使用されています';
    end if;

    return v_existing_transaction.id;
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_store_item_id
  for update;

  -- 事前照合の直後に同じキーの購入が完了した場合に備え、商品ロック後に再照合する。
  select *
  into v_existing_transaction
  from public.economy_transactions
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_transaction.family_id is distinct from v_family_id
      or v_existing_transaction.actor_user_id is distinct from p_user_id
      or v_existing_transaction.type <> 'store_purchase'
      or v_existing_transaction.from_account_type <> 'wallet'
      or v_existing_transaction.from_user_id is distinct from p_user_id
      or v_existing_transaction.to_account_type <> 'treasury'
      or v_existing_transaction.related_type is distinct from 'store_item'
      or v_existing_transaction.related_id is distinct from p_store_item_id then
      raise exception '同じidempotency_keyが別のストア購入に使用されています';
    end if;

    return v_existing_transaction.id;
  end if;

  if v_item.id is null or not v_item.is_active then
    raise exception '購入できる商品が見つかりません';
  end if;
  if v_item.family_id is distinct from v_family_id then
    raise exception '他の家庭の商品は購入できません';
  end if;
  if v_item.stock <= 0 then
    raise exception '商品は在庫切れです';
  end if;

  select *
  into v_snapshot
  from public.get_or_create_monthly_price_index();

  if v_snapshot.family_id is distinct from v_family_id then
    raise exception '購入者と物価指数の家庭が一致しません';
  end if;

  v_sale_price := private.store_sale_price(v_item.price, v_snapshot.price_index);

  if v_sale_price is distinct from p_expected_sale_price then
    raise exception '表示後に価格が変わりました。商品一覧を更新してください';
  end if;

  v_transaction_id := private.transfer_treasury_wallet(
    v_family_id,
    p_user_id,
    p_user_id,
    v_sale_price,
    'wallet_to_treasury',
    'store_purchase',
    v_item.title,
    btrim(p_idempotency_key),
    'store_item',
    p_store_item_id
  );

  update public.economy_transactions
  set
    store_base_price = v_item.price,
    store_price_index = v_snapshot.price_index,
    store_sale_price = v_sale_price
  where id = v_transaction_id;

  update public.store_items
  set stock = stock - 1, updated_at = now()
  where id = p_store_item_id
    and stock < public.store_unlimited_stock();

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'store_purchase', v_item.title, -v_sale_price);

  return v_transaction_id;
end;
$$;

revoke all on function private.purchase_store_item_with_treasury_unchecked(uuid, uuid, text, bigint)
from public, anon, authenticated;

create function public.purchase_store_item(
  p_user_id uuid,
  p_store_item_id uuid,
  p_idempotency_key text,
  p_expected_sale_price bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'ログイン中の利用者本人だけがストア商品を購入できます';
  end if;

  return private.purchase_store_item_with_treasury_unchecked(
    p_user_id,
    p_store_item_id,
    p_idempotency_key,
    p_expected_sale_price
  );
end;
$$;

revoke all on function public.purchase_store_item(uuid, uuid, text, bigint) from public, anon;
grant execute on function public.purchase_store_item(uuid, uuid, text, bigint) to authenticated;
