-- Issue #142: 銀行操作RPCが前提としている bank_accounts をマイグレーションで管理する。
-- 既存環境ではTable Editorから作成済みの場合があるため、再適用可能な形にする。

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  deposit_balance numeric not null default 0,
  interest_rate numeric not null default 0.05,
  loan_balance numeric not null default 0,
  loan_rate numeric not null default 0.10,
  loan_purpose text,
  updated_at timestamptz not null default now()
);

-- Table Editorで作られた旧テーブルにも不足カラムとデフォルト値を補う。
alter table public.bank_accounts
  add column if not exists deposit_balance numeric,
  add column if not exists interest_rate numeric,
  add column if not exists loan_balance numeric,
  add column if not exists loan_rate numeric,
  add column if not exists loan_purpose text,
  add column if not exists updated_at timestamptz;

update public.bank_accounts
set
  deposit_balance = coalesce(deposit_balance, 0),
  interest_rate = coalesce(interest_rate, 0.05),
  loan_balance = coalesce(loan_balance, 0),
  loan_rate = coalesce(loan_rate, 0.10),
  updated_at = coalesce(updated_at, now())
where
  deposit_balance is null
  or interest_rate is null
  or loan_balance is null
  or loan_rate is null
  or updated_at is null;

alter table public.bank_accounts
  alter column deposit_balance set default 0,
  alter column deposit_balance set not null,
  alter column interest_rate set default 0.05,
  alter column interest_rate set not null,
  alter column loan_balance set default 0,
  alter column loan_balance set not null,
  alter column loan_rate set default 0.10,
  alter column loan_rate set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_deposit_balance_nonnegative'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_deposit_balance_nonnegative
      check (deposit_balance >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_loan_balance_nonnegative'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_loan_balance_nonnegative
      check (loan_balance >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_interest_rate_range'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_interest_rate_range
      check (interest_rate >= 0 and interest_rate <= 1) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_loan_rate_range'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_loan_rate_range
      check (loan_rate >= 0 and loan_rate <= 1) not valid;
  end if;
end;
$$;

alter table public.bank_accounts validate constraint bank_accounts_deposit_balance_nonnegative;
alter table public.bank_accounts validate constraint bank_accounts_loan_balance_nonnegative;
alter table public.bank_accounts validate constraint bank_accounts_interest_rate_range;
alter table public.bank_accounts validate constraint bank_accounts_loan_rate_range;

-- RPCはuser_idで1件をロック・更新するため、ユーザーごとに口座を一意にする。
create unique index if not exists bank_accounts_user_id_unique
  on public.bank_accounts (user_id);

-- 既存ユーザーに口座が無いことが今回の障害原因なので、適用時に必ず補完する。
insert into public.bank_accounts (user_id)
select users.id
from public.users
where not exists (
  select 1
  from public.bank_accounts
  where bank_accounts.user_id = users.id
);

create or replace function public.create_bank_account_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bank_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_bank_account_after_user_insert on public.users;
create trigger create_bank_account_after_user_insert
after insert on public.users
for each row
execute function public.create_bank_account_for_new_user();

