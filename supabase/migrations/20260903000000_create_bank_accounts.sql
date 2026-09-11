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

-- 金融データを推測で修正しない。旧テーブルに不正値や重複がある場合は、
-- 対象を明示して停止し、適用前に管理者が確認・修正できるようにする。
do $$
declare
  v_invalid_count integer;
  v_invalid_ids uuid[];
  v_duplicate_count integer;
  v_duplicate_user_ids uuid[];
begin
  select count(*)
  into v_invalid_count
  from public.bank_accounts
  where deposit_balance < 0
    or loan_balance < 0
    or interest_rate < 0
    or interest_rate > 1
    or loan_rate < 0
    or loan_rate > 1;

  if v_invalid_count > 0 then
    select array_agg(id order by id)
    into v_invalid_ids
    from (
      select id
      from public.bank_accounts
      where deposit_balance < 0
        or loan_balance < 0
        or interest_rate < 0
        or interest_rate > 1
        or loan_rate < 0
        or loan_rate > 1
      order by id
      limit 20
    ) invalid_accounts;

    raise exception using
      message = format('bank_accountsに不正な残高または金利が%s件あります', v_invalid_count),
      detail = format('対象口座ID（最大20件）: %s', v_invalid_ids),
      hint = '負の残高と0〜1の範囲外の金利を確認し、修正後に再実行してください';
  end if;

  select count(*)
  into v_duplicate_count
  from (
    select user_id
    from public.bank_accounts
    group by user_id
    having count(*) > 1
  ) duplicate_users;

  if v_duplicate_count > 0 then
    select array_agg(user_id order by user_id)
    into v_duplicate_user_ids
    from (
      select user_id
      from public.bank_accounts
      group by user_id
      having count(*) > 1
      order by user_id
      limit 20
    ) duplicate_users;

    raise exception using
      message = format('bank_accountsに重複ユーザーが%s件あります', v_duplicate_count),
      detail = format('対象ユーザーID（最大20件）: %s', v_duplicate_user_ids),
      hint = '各口座の残高を確認し、ユーザーごとに1口座へ統合してから再実行してください';
  end if;
end;
$$;

-- 検証済みCHECK制約を経由し、SET NOT NULL時の全件走査と長時間ロックを避ける。
alter table public.bank_accounts
  add constraint bank_accounts_deposit_balance_not_null
    check (deposit_balance is not null) not valid,
  add constraint bank_accounts_interest_rate_not_null
    check (interest_rate is not null) not valid,
  add constraint bank_accounts_loan_balance_not_null
    check (loan_balance is not null) not valid,
  add constraint bank_accounts_loan_rate_not_null
    check (loan_rate is not null) not valid,
  add constraint bank_accounts_updated_at_not_null
    check (updated_at is not null) not valid;

alter table public.bank_accounts validate constraint bank_accounts_deposit_balance_not_null;
alter table public.bank_accounts validate constraint bank_accounts_interest_rate_not_null;
alter table public.bank_accounts validate constraint bank_accounts_loan_balance_not_null;
alter table public.bank_accounts validate constraint bank_accounts_loan_rate_not_null;
alter table public.bank_accounts validate constraint bank_accounts_updated_at_not_null;

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

alter table public.bank_accounts
  drop constraint bank_accounts_deposit_balance_not_null,
  drop constraint bank_accounts_interest_rate_not_null,
  drop constraint bank_accounts_loan_balance_not_null,
  drop constraint bank_accounts_loan_rate_not_null,
  drop constraint bank_accounts_updated_at_not_null;

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

-- トリガーを先に有効化してから既存ユーザーを補完し、適用中に追加されたユーザーも取りこぼさない。
insert into public.bank_accounts (user_id)
select users.id
from public.users
on conflict (user_id) do nothing;
