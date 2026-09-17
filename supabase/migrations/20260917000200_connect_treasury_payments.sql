-- Issue #166: クエスト報酬とストア購入をギルド金庫との資金移動へ接続する。
-- 既存の transactions は画面表示との互換性のため残し、資金の移動元・移動先は
-- economy_transactions に記録する。
-- 過去の transactions は、当時は金庫を介さない新規発行として記録されており、
-- 対応する家庭や金庫残高を安全に復元できない。そのため遡及コピーはせず、
-- このマイグレーション適用後の報酬・購入から2つの台帳へ同時記録する。

-- economy_transactions と同じ安全整数範囲の金額を履歴画面でも保持できるようにする。
alter table public.transactions
  alter column amount type bigint using amount::bigint;

do $$
begin
  if exists (
    select 1
    from public.transactions
    where amount = 0 or abs(amount) > private.safe_integer_max()
  ) then
    raise exception 'transactions.amount に0または安全な整数の範囲外の既存データがあります';
  end if;
  if exists (
    select 1 from public.quests
    where reward_amount is null
      or reward_amount <= 0
      or reward_amount <> trunc(reward_amount)
      or reward_amount > private.safe_integer_max()
  ) then
    raise exception 'quests.reward_amount に1HMC以上の安全な整数でない既存データがあります';
  end if;
end;
$$;

alter table public.transactions
  drop constraint if exists transactions_amount_safe_nonzero;
alter table public.transactions
  add constraint transactions_amount_safe_nonzero
  check (amount <> 0 and abs(amount) <= private.safe_integer_max());

-- 購入金額をクライアントから受け取ると改ざんできるため、価格と在庫はDBに保存する。
-- 商品の追加・編集UIと一覧のSupabase接続は Issue #64 で行う。
create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 100),
  description text not null default '',
  image_url text not null default '',
  price bigint not null check (price > 0 and price <= private.safe_integer_max()),
  stock bigint not null default 0 check (stock >= 0 and stock <= private.safe_integer_max()),
  requested_by uuid not null references public.users (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_items_family_created_at_idx
  on public.store_items (family_id, created_at desc);

alter table public.store_items enable row level security;

create policy store_items_select_own
on public.store_items
for select
to authenticated
using (family_id = public.current_user_family_id());

revoke all on table public.store_items from anon;
revoke insert, update, delete on table public.store_items from authenticated;
grant select on table public.store_items to authenticated;

-- クエスト承認、報酬支払い、2つの台帳への記帳を同じトランザクションで確定する。
create or replace function public.approve_quest_log(
  p_quest_log_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest_id uuid;
  v_user_id uuid;
  v_reward numeric;
  v_title text;
  v_approver_family_id uuid;
  v_approver_role text;
  v_recipient_family_id uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_approver_id then
    raise exception 'ログイン中の利用者本人だけがクエストを承認できます';
  end if;

  select ql.quest_id, ql.user_id, q.reward_amount, q.title
  into v_quest_id, v_user_id, v_reward, v_title
  from public.quest_logs ql
  join public.quests q on q.id = ql.quest_id
  where ql.id = p_quest_log_id
    and ql.status = 'pending'
  for update of ql;

  if not found then
    raise exception '承認待ちのクエスト完了報告が見つかりません';
  end if;
  if v_reward is null
    or v_reward <= 0
    or v_reward <> trunc(v_reward)
    or v_reward > private.safe_integer_max() then
    raise exception 'クエスト報酬は1HMC以上の安全な整数で指定してください';
  end if;

  select family_id, role
  into v_approver_family_id, v_approver_role
  from public.users
  where id = p_approver_id;

  if not found or v_approver_family_id is null then
    raise exception '承認者の家庭情報が見つかりません';
  end if;
  if v_approver_role <> 'parent' then
    raise exception 'クエストを承認できるのは親だけです';
  end if;

  select family_id
  into v_recipient_family_id
  from public.users
  where id = v_user_id;

  if not found or v_recipient_family_id is distinct from v_approver_family_id then
    raise exception '同じ家庭に所属する利用者のクエストだけを承認できます';
  end if;

  perform private.transfer_treasury_wallet(
    v_approver_family_id,
    v_user_id,
    p_approver_id,
    v_reward::bigint,
    'treasury_to_wallet',
    'quest_reward',
    v_title,
    'quest_reward:' || p_quest_log_id::text,
    'quest_log',
    p_quest_log_id
  );

  insert into public.transactions (user_id, type, description, amount, quest_log_id)
  values (v_user_id, 'quest_reward', v_title, v_reward::bigint, p_quest_log_id)
  on conflict (quest_log_id) where quest_log_id is not null do nothing;

  update public.quest_logs
  set status = 'approved', approved_by = p_approver_id, approved_at = now()
  where id = p_quest_log_id;

  update public.quests
  set status = 'completed'
  where id = v_quest_id;
end;
$$;

revoke all on function public.approve_quest_log(uuid, uuid) from public;
revoke all on function public.approve_quest_log(uuid, uuid) from anon;
grant execute on function public.approve_quest_log(uuid, uuid) to authenticated;

-- 商品行をロックし、DB上の価格と在庫を使ってWalletから金庫へ支払う。
-- 同じ冪等キーの再送では在庫も残高も二重に減らさない。
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
declare
  v_family_id uuid;
  v_role text;
  v_item public.store_items%rowtype;
  v_existing_transaction public.economy_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;

  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'ログイン中の利用者本人だけがストア商品を購入できます';
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

  -- 完了済みの購入は、その後に商品が無効化・削除されても同じ取引IDを返す。
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

  v_transaction_id := private.transfer_treasury_wallet(
    v_family_id,
    p_user_id,
    p_user_id,
    v_item.price,
    'wallet_to_treasury',
    'store_purchase',
    v_item.title,
    btrim(p_idempotency_key),
    'store_item',
    p_store_item_id
  );

  update public.store_items
  set stock = stock - 1, updated_at = now()
  where id = p_store_item_id;

  insert into public.transactions (user_id, type, description, amount)
  values (p_user_id, 'store_purchase', v_item.title, -v_item.price);

  return v_transaction_id;
end;
$$;

revoke all on function public.purchase_store_item(uuid, uuid, text) from public;
revoke all on function public.purchase_store_item(uuid, uuid, text) from anon;
grant execute on function public.purchase_store_item(uuid, uuid, text) to authenticated;
