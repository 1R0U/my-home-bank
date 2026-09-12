-- Issue #165: 家族単位のギルド金庫と、HMCの移動を記録する経済台帳を作る。
-- 既存transactionsは現行画面との互換性を保ち、#166で新台帳へ接続する。

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists family_id uuid references public.families (id) on delete restrict;

create index if not exists users_family_id_idx on public.users (family_id);

create table if not exists public.guild_treasuries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null unique references public.families (id) on delete restrict,
  balance bigint not null,
  initial_supply bigint not null,
  total_supply bigint not null,
  minimum_reserve_rate numeric(5, 4) not null default 0.2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guild_treasuries_balance_nonnegative check (balance >= 0),
  constraint guild_treasuries_initial_supply_nonnegative check (initial_supply >= 0),
  constraint guild_treasuries_total_supply_nonnegative check (total_supply >= 0),
  constraint guild_treasuries_balance_within_supply check (balance <= total_supply),
  constraint guild_treasuries_reserve_rate_range
    check (minimum_reserve_rate >= 0 and minimum_reserve_rate <= 1)
);

create table if not exists public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  actor_user_id uuid references public.users (id) on delete set null,
  type text not null check (
    type in (
      'treasury_initialization', 'treasury_issue',
      'quest_reward', 'store_purchase',
      'loan_disburse', 'loan_repay_principal', 'loan_interest',
      'savings_auto_transfer', 'savings_withdraw', 'savings_interest'
    )
  ),
  from_account_type text not null check (
    from_account_type in ('system', 'treasury', 'wallet', 'savings')
  ),
  from_user_id uuid references public.users (id) on delete set null,
  to_account_type text not null check (
    to_account_type in ('system', 'treasury', 'wallet', 'savings')
  ),
  to_user_id uuid references public.users (id) on delete set null,
  amount bigint not null check (amount > 0),
  description text not null,
  related_type text,
  related_id uuid,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint economy_transactions_distinct_accounts check (
    from_account_type <> to_account_type
    or from_user_id is distinct from to_user_id
  ),
  constraint economy_transactions_from_user_consistency check (
    (from_account_type in ('wallet', 'savings') and from_user_id is not null)
    or (from_account_type in ('system', 'treasury') and from_user_id is null)
  ),
  constraint economy_transactions_to_user_consistency check (
    (to_account_type in ('wallet', 'savings') and to_user_id is not null)
    or (to_account_type in ('system', 'treasury') and to_user_id is null)
  )
);

create index if not exists economy_transactions_family_created_at_idx
  on public.economy_transactions (family_id, created_at desc);

create index if not exists economy_transactions_actor_created_at_idx
  on public.economy_transactions (actor_user_id, created_at desc);

create or replace function public.current_user_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select users.family_id
  from public.users
  where users.id = auth.uid()
$$;

create or replace function public.current_user_is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select users.role = 'parent'
    from public.users
    where users.id = auth.uid()
  ), false)
$$;

revoke all on function public.current_user_family_id() from public, anon;
revoke all on function public.current_user_is_parent() from public, anon;
grant execute on function public.current_user_family_id() to authenticated;
grant execute on function public.current_user_is_parent() to authenticated;

alter table public.families enable row level security;
alter table public.guild_treasuries enable row level security;
alter table public.economy_transactions enable row level security;

create policy families_select_own
on public.families
for select
to authenticated
using (id = public.current_user_family_id());

create policy guild_treasuries_select_own
on public.guild_treasuries
for select
to authenticated
using (family_id = public.current_user_family_id());

create policy economy_transactions_select_own
on public.economy_transactions
for select
to authenticated
using (family_id = public.current_user_family_id());

revoke all on table public.families from anon;
revoke all on table public.guild_treasuries from anon;
revoke all on table public.economy_transactions from anon;
revoke insert, update, delete on table public.families from authenticated;
revoke insert, update, delete on table public.guild_treasuries from authenticated;
revoke insert, update, delete on table public.economy_transactions from authenticated;
grant select on table public.families to authenticated;
grant select on table public.guild_treasuries to authenticated;
grant select on table public.economy_transactions to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- family_idを直接差し替えて他家族のRLS範囲へ入る操作を拒否する。
-- 家族への参加・離脱は、後続で追加するsecurity definer関数だけが行う。
create or replace function private.protect_user_family_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if (tg_op = 'INSERT' and new.family_id is not null)
      or (tg_op = 'UPDATE' and new.family_id is distinct from old.family_id) then
      raise exception 'family_idは家族管理機能からのみ変更できます';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_user_family_id() from public, anon, authenticated;

drop trigger if exists protect_user_family_id_on_write on public.users;
create trigger protect_user_family_id_on_write
before insert or update of family_id on public.users
for each row
execute function private.protect_user_family_id();

-- 後続の報酬・購入RPCから呼ぶ内部送金関数。金庫とWalletを同時に更新して台帳へ記録する。
create or replace function private.transfer_treasury_wallet(
  p_family_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_amount bigint,
  p_direction text,
  p_transaction_type text,
  p_description text,
  p_idempotency_key text,
  p_related_type text default null,
  p_related_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_existing_transaction public.economy_transactions%rowtype;
  v_treasury public.guild_treasuries%rowtype;
  v_wallet_balance numeric;
  v_user_family_id uuid;
  v_actor_family_id uuid;
  v_minimum_reserve bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '送金額は1HMC以上で指定してください';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;
  if p_direction not in ('treasury_to_wallet', 'wallet_to_treasury') then
    raise exception '未対応の送金方向です: %', p_direction;
  end if;
  if (p_direction = 'treasury_to_wallet' and p_transaction_type not in ('quest_reward', 'loan_disburse'))
    or (p_direction = 'wallet_to_treasury' and p_transaction_type not in (
      'store_purchase', 'loan_repay_principal', 'loan_interest'
    )) then
    raise exception '送金方向と取引種別が一致しません';
  end if;

  select *
  into v_existing_transaction
  from public.economy_transactions
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_transaction.family_id is distinct from p_family_id
      or v_existing_transaction.actor_user_id is distinct from p_actor_user_id
      or v_existing_transaction.type is distinct from p_transaction_type
      or v_existing_transaction.amount is distinct from p_amount
      or v_existing_transaction.from_account_type is distinct from
        case when p_direction = 'treasury_to_wallet' then 'treasury' else 'wallet' end
      or v_existing_transaction.from_user_id is distinct from
        case when p_direction = 'wallet_to_treasury' then p_user_id else null end
      or v_existing_transaction.to_account_type is distinct from
        case when p_direction = 'treasury_to_wallet' then 'wallet' else 'treasury' end
      or v_existing_transaction.to_user_id is distinct from
        case when p_direction = 'treasury_to_wallet' then p_user_id else null end
      or v_existing_transaction.related_type is distinct from p_related_type
      or v_existing_transaction.related_id is distinct from p_related_id then
      raise exception '同じidempotency_keyが別の資金移動に使用されています';
    end if;

    return v_existing_transaction.id;
  end if;

  if p_actor_user_id is not null then
    select family_id
    into v_actor_family_id
    from public.users
    where id = p_actor_user_id;

    if not found or v_actor_family_id is distinct from p_family_id then
      raise exception '操作ユーザーが家族に所属していません';
    end if;
  end if;

  select family_id
  into v_user_family_id
  from public.users
  where id = p_user_id;

  if not found or v_user_family_id is distinct from p_family_id then
    raise exception '送金先または送金元のユーザーが家族に所属していません';
  end if;

  select *
  into v_treasury
  from public.guild_treasuries
  where family_id = p_family_id
  for update;

  if not found then
    raise exception 'ギルド金庫が見つかりません';
  end if;

  select balance
  into v_wallet_balance
  from public.users
  where id = p_user_id
  for update;

  v_minimum_reserve := floor(v_treasury.total_supply * v_treasury.minimum_reserve_rate);

  if p_direction = 'treasury_to_wallet' then
    if v_treasury.balance - p_amount < v_minimum_reserve then
      raise exception 'ギルド金庫の最低準備金を下回るため送金できません';
    end if;

    update public.guild_treasuries
    set balance = balance - p_amount, updated_at = now()
    where id = v_treasury.id;

    update public.users
    set balance = balance + p_amount
    where id = p_user_id;
  else
    if v_wallet_balance < p_amount then
      raise exception 'Wallet残高が不足しています';
    end if;

    update public.users
    set balance = balance - p_amount
    where id = p_user_id;

    update public.guild_treasuries
    set balance = balance + p_amount, updated_at = now()
    where id = v_treasury.id;
  end if;

  insert into public.economy_transactions (
    family_id, actor_user_id, type,
    from_account_type, from_user_id,
    to_account_type, to_user_id,
    amount, description, related_type, related_id, idempotency_key
  )
  values (
    p_family_id,
    p_actor_user_id,
    p_transaction_type,
    case when p_direction = 'treasury_to_wallet' then 'treasury' else 'wallet' end,
    case when p_direction = 'wallet_to_treasury' then p_user_id else null end,
    case when p_direction = 'treasury_to_wallet' then 'wallet' else 'treasury' end,
    case when p_direction = 'treasury_to_wallet' then p_user_id else null end,
    p_amount,
    p_description,
    p_related_type,
    p_related_id,
    btrim(p_idempotency_key)
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

revoke all on function private.transfer_treasury_wallet(
  uuid, uuid, uuid, bigint, text, text, text, text, text, uuid
) from public, anon, authenticated;

create or replace function public.create_family_with_treasury(
  p_family_name text,
  p_initial_supply bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_existing_transaction public.economy_transactions%rowtype;
  v_existing_family_name text;
  v_family_id uuid;
  v_user_role text;
  v_user_family_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'ログインが必要です';
  end if;
  if p_family_name is null or length(btrim(p_family_name)) not between 1 and 100 then
    raise exception '家族名は1〜100文字で指定してください';
  end if;
  if p_initial_supply is null or p_initial_supply <= 0 then
    raise exception '初期HMCは1HMC以上で指定してください';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;

  select *
  into v_existing_transaction
  from public.economy_transactions
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    select name
    into v_existing_family_name
    from public.families
    where id = v_existing_transaction.family_id;

    if v_existing_transaction.actor_user_id is distinct from v_actor_user_id
      or v_existing_transaction.type <> 'treasury_initialization'
      or v_existing_transaction.amount <> p_initial_supply
      or v_existing_family_name <> btrim(p_family_name) then
      raise exception '同じidempotency_keyが別の家族作成に使用されています';
    end if;

    return v_existing_transaction.family_id;
  end if;

  select role, family_id
  into v_user_role, v_user_family_id
  from public.users
  where id = v_actor_user_id
  for update;

  if not found then
    raise exception 'ユーザー情報が見つかりません';
  end if;
  if v_user_role <> 'parent' then
    raise exception '家族とギルド金庫を作成できるのは親だけです';
  end if;
  if v_user_family_id is not null then
    raise exception 'ユーザーはすでに家族へ所属しています';
  end if;

  insert into public.families (name)
  values (btrim(p_family_name))
  returning id into v_family_id;

  update public.users
  set family_id = v_family_id
  where id = v_actor_user_id;

  insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply)
  values (v_family_id, p_initial_supply, p_initial_supply, p_initial_supply);

  insert into public.economy_transactions (
    family_id, actor_user_id, type,
    from_account_type, to_account_type,
    amount, description, idempotency_key
  )
  values (
    v_family_id, v_actor_user_id, 'treasury_initialization',
    'system', 'treasury',
    p_initial_supply, 'ギルド金庫の初期HMC', btrim(p_idempotency_key)
  );

  return v_family_id;
end;
$$;

create or replace function public.issue_treasury_hmc(
  p_amount bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_family_id uuid;
  v_role text;
  v_treasury public.guild_treasuries%rowtype;
  v_existing_transaction public.economy_transactions%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'ログインが必要です';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '追加発行額は1HMC以上で指定してください';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;

  select family_id, role
  into v_family_id, v_role
  from public.users
  where id = v_actor_user_id;

  if not found or v_family_id is null then
    raise exception '家族情報が見つかりません';
  end if;
  if v_role <> 'parent' then
    raise exception 'HMCを追加発行できるのは親だけです';
  end if;

  select *
  into v_existing_transaction
  from public.economy_transactions
  where idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_transaction.family_id is distinct from v_family_id
      or v_existing_transaction.actor_user_id is distinct from v_actor_user_id
      or v_existing_transaction.type <> 'treasury_issue'
      or v_existing_transaction.amount <> p_amount then
      raise exception '同じidempotency_keyが別の追加発行に使用されています';
    end if;

    select * into v_treasury
    from public.guild_treasuries
    where family_id = v_family_id;
    return to_jsonb(v_treasury);
  end if;

  update public.guild_treasuries
  set
    balance = balance + p_amount,
    total_supply = total_supply + p_amount,
    updated_at = now()
  where family_id = v_family_id
  returning * into v_treasury;

  if not found then
    raise exception 'ギルド金庫が見つかりません';
  end if;

  insert into public.economy_transactions (
    family_id, actor_user_id, type,
    from_account_type, to_account_type,
    amount, description, idempotency_key
  )
  values (
    v_family_id, v_actor_user_id, 'treasury_issue',
    'system', 'treasury',
    p_amount, '親によるHMCの追加発行', btrim(p_idempotency_key)
  );

  return to_jsonb(v_treasury);
end;
$$;

revoke all on function public.create_family_with_treasury(text, bigint, text) from public, anon;
revoke all on function public.issue_treasury_hmc(bigint, text) from public, anon;
grant execute on function public.create_family_with_treasury(text, bigint, text) to authenticated;
grant execute on function public.issue_treasury_hmc(bigint, text) to authenticated;
