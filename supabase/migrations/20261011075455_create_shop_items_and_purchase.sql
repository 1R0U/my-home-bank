-- Issue #225: 着せ替え品・装飾品を買って、所有として記録する -------------------------------
--
-- 【何を作るか】
-- - shop_items: 着せ替え品・装飾品の品書き（アプリ共通。家庭ごとではない）
--   「最初から持っている品（is_starter）」と「ストアで買う品（price）」のどちらか。
--   見た目と付く場所はコード側のカタログ（lib/rpg-hub/catalog.ts）が持ち、ここでは
--   asset_id で結ぶ。名前（title）は購入の記帳（取引履歴の説明）に使うためDBにも持つ。
-- - 最初から持っている品を、利用者が増えたときに自動で配るトリガー
-- - 品書きを物価指数つきで返す get_shop_catalog と、買う purchase_shop_item
-- - 装飾は「持っている種類だけ置ける」ようにする（placed_decorations のポリシー）
--
-- 品書きの中身（どれが最初の品で、いくらか）と、今までの利用者への配布は、
-- 構造の変更と分けて 次のマイグレーション（seed_shop_items）で入れる（AGENTS.md）。
--
-- 【所有の持ち方】
-- 着せ替え品も装飾品も owned_items（user_id, asset_id）に1行。装飾は種類ごとに持ち、
-- 持っている種類なら今までどおり何個でも置ける（個数は数えない）。
--
-- 【お金の流れ】
-- ストアの商品（purchase_store_item）と同じく、子供の Wallet からギルド金庫へ払い、
-- 物価指数を掛けた販売価格で記帳する。払うのと所有を記録するのは同じトランザクションで、
-- どちらかだけが残ることはない。同じ idempotency_key で2回届いても1回ぶんにする。

-- 1. 品書き ---------------------------------------------------------------------------------
create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique,
  kind text not null,
  title text not null,
  -- 基準価格（物価指数を掛ける前）。最初から持っている品は NULL
  price bigint,
  is_starter boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint shop_items_kind_allowed check (kind in ('wearable', 'decoration')),
  constraint shop_items_asset_id_matches_kind
    check (asset_id like kind || '-%'),
  constraint shop_items_title_length
    check (length(btrim(title)) between 1 and 100),
  -- 最初から持っている品は売らない。売る品は値段を持つ
  constraint shop_items_starter_or_price check (
    (is_starter and price is null)
    or (not is_starter and price is not null and price > 0 and price <= 9007199254740991)
  )
);

alter table public.shop_items enable row level security;

-- 品書きはアプリ共通なので、ログインしていればだれでも読める。書き込みはマイグレーションだけ
create policy shop_items_select_all on public.shop_items
for select to authenticated using (true);

create policy shop_items_active_child_session on public.shop_items as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

revoke all on table public.shop_items from anon, authenticated;
grant select on table public.shop_items to authenticated;

-- 2. 最初から持っている品を配る ---------------------------------------------------------------
-- 利用者1人に、まだ持っていない「最初から持っている品」を配る。配った件数を返す。
create or replace function private.grant_starter_items(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.owned_items (user_id, asset_id)
  select p_user_id, shop_items.asset_id
  from public.shop_items
  where shop_items.is_starter and shop_items.is_active
  on conflict (user_id, asset_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 利用者が増えたら配る（後から加わった子供にも行き渡るように）
create or replace function private.grant_starter_items_after_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.grant_starter_items(new.id);
  return new;
end;
$$;

create trigger grant_starter_items_after_user_insert
after insert on public.users
for each row execute function private.grant_starter_items_after_user_insert();

-- 3. 品書きを返す ------------------------------------------------------------------------------
-- ストアで買う品（最初から持っている品は除く）を、ログイン中の家庭の物価指数を掛けた
-- 販売価格と、自分がもう持っているかを付けて返す。
-- get_current_store_catalog と同じく、その月の物価指数がまだ無ければ作る。
create or replace function public.get_shop_catalog()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.economy_monthly_snapshots%rowtype;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  select * into v_snapshot from public.get_or_create_monthly_price_index();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', shop_items.id,
        'asset_id', shop_items.asset_id,
        'kind', shop_items.kind,
        'title', shop_items.title,
        'base_price', shop_items.price,
        'price_index', v_snapshot.price_index,
        'sale_price', private.store_sale_price(shop_items.price, v_snapshot.price_index),
        'owned', exists (
          select 1 from public.owned_items
          where owned_items.user_id = auth.uid() and owned_items.asset_id = shop_items.asset_id
        )
      )
      order by shop_items.kind, shop_items.sort_order, shop_items.asset_id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.shop_items
  where shop_items.is_active and not shop_items.is_starter;

  return jsonb_build_object('price_index', v_snapshot.price_index, 'items', v_items);
end;
$$;

revoke all on function public.get_shop_catalog() from public, anon;
grant execute on function public.get_shop_catalog() to authenticated;

-- 4. 買う --------------------------------------------------------------------------------------
--
-- purchase_store_item_with_treasury_unchecked と同じ形。違いは次のとおり。
--   - 在庫は無い（何人でも買える）
--   - 1つの品は1回だけ買える。もう持っていれば断る（着せ替えも装飾も、種類ごとに持つため）
--   - 払ったら owned_items に所有を記録する
-- 戻り値は台帳（economy_transactions）の取引ID。同じキーの再送には同じIDを返す。
create or replace function private.purchase_shop_item_unchecked(
  p_user_id uuid,
  p_shop_item_id uuid,
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
  v_item public.shop_items%rowtype;
  v_snapshot public.economy_monthly_snapshots%rowtype;
  v_sale_price bigint;
  v_existing public.economy_transactions%rowtype;
  v_transaction_id uuid;
  v_key text := btrim(p_idempotency_key);
begin
  if p_idempotency_key is null or length(v_key) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;
  if p_expected_sale_price is null
    or p_expected_sale_price <= 0
    or p_expected_sale_price > private.safe_integer_max() then
    raise exception '有効な表示価格を指定してください';
  end if;

  -- 同じ利用者の購入を1つずつにする（同じ品を同時に2回買えないように）
  select users.family_id, users.role into v_family_id, v_role
  from public.users where users.id = p_user_id
  for update;

  if not found or v_family_id is null then
    raise exception '購入者の家庭情報が見つかりません';
  end if;
  if v_role <> 'child' then
    raise exception 'きせかえ・かざりを買えるのは子どもだけです';
  end if;

  -- 完了済みの購入は、価格や品書きが変わっても同じ取引IDを返す
  select * into v_existing
  from public.economy_transactions
  where economy_transactions.idempotency_key = v_key;

  if found then
    if v_existing.family_id is distinct from v_family_id
      or v_existing.actor_user_id is distinct from p_user_id
      or v_existing.type <> 'store_purchase'
      or v_existing.related_type is distinct from 'shop_item'
      or v_existing.related_id is distinct from p_shop_item_id then
      raise exception '同じidempotency_keyが別の購入に使用されています';
    end if;
    return v_existing.id;
  end if;

  select * into v_item from public.shop_items where shop_items.id = p_shop_item_id;

  if v_item.id is null or not v_item.is_active or v_item.is_starter then
    raise exception '購入できる品が見つかりません';
  end if;

  if exists (
    select 1 from public.owned_items
    where owned_items.user_id = p_user_id and owned_items.asset_id = v_item.asset_id
  ) then
    raise exception 'その品はもう持っています';
  end if;

  perform 1 from public.guild_treasuries where guild_treasuries.family_id = v_family_id for update;
  select * into v_snapshot from public.get_or_create_monthly_price_index();

  if v_snapshot.family_id is distinct from v_family_id then
    raise exception '購入者と物価指数の家庭が一致しません';
  end if;

  v_sale_price := private.store_sale_price(v_item.price, v_snapshot.price_index);

  if v_sale_price is distinct from p_expected_sale_price then
    raise exception '表示後に価格が変わりました。商品一覧を更新してください';
  end if;

  -- 残高が足りなければ、ここで例外になる（ストアの購入と同じ）
  v_transaction_id := private.transfer_treasury_wallet(
    v_family_id,
    p_user_id,
    p_user_id,
    v_sale_price,
    'wallet_to_treasury',
    'store_purchase',
    v_item.title,
    v_key,
    'shop_item',
    p_shop_item_id
  );

  update public.economy_transactions
  set store_base_price = v_item.price,
      store_price_index = v_snapshot.price_index,
      store_sale_price = v_sale_price
  where economy_transactions.id = v_transaction_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'store_purchase', v_item.title, -v_sale_price);

  insert into public.owned_items (user_id, asset_id)
  values (p_user_id, v_item.asset_id);

  return v_transaction_id;
end;
$$;

create or replace function public.purchase_shop_item(
  p_shop_item_id uuid,
  p_idempotency_key text,
  p_expected_sale_price bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  return private.purchase_shop_item_unchecked(
    auth.uid(), p_shop_item_id, p_idempotency_key, p_expected_sale_price
  );
end;
$$;

revoke all on function private.grant_starter_items(uuid) from public, anon, authenticated;
revoke all on function private.grant_starter_items_after_user_insert() from public, anon, authenticated;
revoke all on function private.purchase_shop_item_unchecked(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.purchase_shop_item(uuid, text, bigint) from public, anon;
grant execute on function public.purchase_shop_item(uuid, text, bigint) to authenticated;

-- 5. 装飾は持っている種類だけ置ける ----------------------------------------------------------------
-- 置く（insert）・動かす（update）ときに、その種類を持っているかを確かめる。
-- アプリは持っている種類しか選ばせないが、DB側でも止める。
drop policy if exists placed_decorations_insert_self on public.placed_decorations;
create policy placed_decorations_insert_self on public.placed_decorations
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.owned_items
    where owned_items.user_id = auth.uid() and owned_items.asset_id = placed_decorations.asset_id
  )
);

drop policy if exists placed_decorations_update_self on public.placed_decorations;
create policy placed_decorations_update_self on public.placed_decorations
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.owned_items
    where owned_items.user_id = auth.uid() and owned_items.asset_id = placed_decorations.asset_id
  )
);
