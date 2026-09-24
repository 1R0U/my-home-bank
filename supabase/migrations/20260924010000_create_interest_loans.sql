-- Issue #160: ギルド金庫を原資とする金利付きローン。
--
-- bank_accounts.loan_balance は既存画面との互換性のため「未返済元本の合計」として残す。
-- 金利・期限・返済内訳は loans / loan_repayments を正とし、契約後に設定を変えても
-- 既存契約へ影響しないよう承認時の値をスナップショットする。

-- bigint化で小数を丸めてしまう前に、既存残高を安全に移行できるか確認する。
do $$
begin
  if exists (
    select 1
    from public.bank_accounts
    where loan_balance < 0
      or loan_balance <> trunc(loan_balance)
      or loan_balance > 9007199254740991
      or ceil(loan_balance * loan_rate) > 9007199254740991 - loan_balance
  ) then
    raise exception '既存の借入残高を安全な金利付きローンへ移行できません';
  end if;
end;
$$;

alter table public.bank_accounts
  add column loan_limit bigint not null default 0,
  add column loan_term_days integer not null default 30;

alter table public.bank_accounts
  alter column loan_balance type bigint using loan_balance::bigint,
  alter column loan_rate set default 0.0500;

alter table public.bank_accounts
  add constraint bank_accounts_loan_balance_safe_integer
    check (loan_balance <= 9007199254740991),
  add constraint bank_accounts_loan_limit_safe_nonnegative
    check (loan_limit >= 0 and loan_limit <= 9007199254740991),
  add constraint bank_accounts_loan_term_days_range
    check (loan_term_days between 1 and 3650);

-- 旧loan_rateは期間が未定義だったため、未契約口座の標準値をV1の月利5%へ揃える。
update public.bank_accounts
set loan_rate = 0.0500
where loan_balance = 0 and loan_rate = 0.1000;

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  borrower_id uuid not null references public.users (id) on delete restrict,
  requested_amount bigint not null,
  purpose text not null,
  status text not null default 'pending',
  monthly_interest_rate numeric(7, 6),
  term_days integer,
  principal_amount bigint,
  interest_amount bigint,
  principal_repaid bigint not null default 0,
  interest_repaid bigint not null default 0,
  request_idempotency_key text not null unique,
  approved_by uuid references public.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint loans_requested_amount_safe_positive
    check (requested_amount > 0 and requested_amount <= 9007199254740991),
  constraint loans_purpose_length check (length(btrim(purpose)) between 1 and 500),
  constraint loans_status_check check (status in ('pending', 'active', 'rejected', 'paid')),
  constraint loans_interest_rate_range
    check (monthly_interest_rate is null or monthly_interest_rate between 0 and 1),
  constraint loans_term_days_range check (term_days is null or term_days between 1 and 3650),
  constraint loans_principal_safe_positive
    check (principal_amount is null or principal_amount between 1 and 9007199254740991),
  constraint loans_interest_safe_nonnegative
    check (interest_amount is null or interest_amount between 0 and 9007199254740991),
  constraint loans_repaid_safe_nonnegative
    check (
      principal_repaid between 0 and 9007199254740991
      and interest_repaid between 0 and 9007199254740991
    ),
  constraint loans_repaid_within_contract check (
    (principal_amount is null or principal_repaid <= principal_amount)
    and (interest_amount is null or interest_repaid <= interest_amount)
  ),
  constraint loans_contract_fields_check check (
    (status in ('pending', 'rejected')
      and monthly_interest_rate is null and term_days is null
      and principal_amount is null and interest_amount is null
      and approved_at is null and due_at is null)
    or
    (status in ('active', 'paid')
      and monthly_interest_rate is not null and term_days is not null
      and principal_amount is not null and interest_amount is not null
      and approved_at is not null and due_at is not null)
  ),
  constraint loans_completion_check check (
    (status = 'paid' and completed_at is not null
      and principal_repaid = principal_amount and interest_repaid = interest_amount)
    or (status <> 'paid' and completed_at is null)
  ),
  constraint loans_request_idempotency_key_length
    check (length(btrim(request_idempotency_key)) between 1 and 200)
);

create table public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  loan_id uuid not null references public.loans (id) on delete restrict,
  borrower_id uuid not null references public.users (id) on delete restrict,
  amount bigint not null,
  principal_amount bigint not null,
  interest_amount bigint not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint loan_repayments_amount_safe_positive
    check (amount > 0 and amount <= 9007199254740991),
  constraint loan_repayments_components_nonnegative
    check (principal_amount >= 0 and interest_amount >= 0),
  constraint loan_repayments_components_sum
    check (amount = principal_amount + interest_amount),
  constraint loan_repayments_idempotency_key_length
    check (length(btrim(idempotency_key)) between 1 and 180)
);

create index loans_family_requested_at_idx
  on public.loans (family_id, requested_at desc);
create index loans_borrower_status_idx
  on public.loans (borrower_id, status, due_at);
create unique index loans_one_pending_per_borrower
  on public.loans (borrower_id) where status = 'pending';
create index loan_repayments_loan_created_at_idx
  on public.loan_repayments (loan_id, created_at desc);

-- 旧単純ローンが残っている場合は、消さずに移行時点の契約へ変換する。
-- 旧loan_rateには期間定義がなかったため月利として引き継ぎ、期限は標準30日とする。
insert into public.loans (
  family_id, borrower_id, requested_amount, purpose, status,
  monthly_interest_rate, term_days, principal_amount, interest_amount,
  request_idempotency_key, requested_at, approved_at, due_at, updated_at
)
select
  u.family_id,
  ba.user_id,
  ba.loan_balance,
  coalesce(nullif(btrim(ba.loan_purpose), ''), '旧ローンからの移行'),
  'active',
  ba.loan_rate,
  30,
  ba.loan_balance,
  ceil(ba.loan_balance * ba.loan_rate)::bigint,
  'legacy-loan:' || ba.id::text,
  now(),
  now(),
  now() + interval '30 days',
  now()
from public.bank_accounts ba
join public.users u on u.id = ba.user_id
where ba.loan_balance > 0;

alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;

create policy loans_select_own_or_parent
on public.loans for select to authenticated
using (
  family_id = public.current_user_family_id()
  and (
    borrower_id = auth.uid()
    or exists (select 1 from public.users where id = auth.uid() and role = 'parent')
  )
);

create policy loan_repayments_select_own_or_parent
on public.loan_repayments for select to authenticated
using (
  family_id = public.current_user_family_id()
  and (
    borrower_id = auth.uid()
    or exists (select 1 from public.users where id = auth.uid() and role = 'parent')
  )
);

revoke all on table public.loans from anon;
revoke all on table public.loan_repayments from anon;
revoke insert, update, delete on table public.loans from authenticated;
revoke insert, update, delete on table public.loan_repayments from authenticated;
grant select on table public.loans to authenticated;
grant select on table public.loan_repayments to authenticated;

-- 子ども本人または同じ家庭の親が、現在の設定と貸出可能額を確認する。
create function public.get_loan_offer(p_borrower_id uuid)
returns table (
  loan_limit bigint,
  monthly_interest_rate numeric,
  term_days integer,
  outstanding_principal bigint,
  treasury_available bigint,
  available_amount bigint,
  has_overdue boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_role text;
  v_account public.bank_accounts%rowtype;
  v_treasury public.guild_treasuries%rowtype;
  v_treasury_available bigint;
begin
  select family_id, role into v_family_id, v_role
  from public.users where id = p_borrower_id;

  if not found or v_family_id is null then
    raise exception '借入対象の家族情報が見つかりません';
  end if;
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if auth.uid() is distinct from p_borrower_id and not exists (
    select 1 from public.users
    where id = auth.uid() and family_id = v_family_id and role = 'parent'
  ) then
    raise exception '同じ家庭の親または本人だけがローン情報を確認できます';
  end if;

  select * into v_account from public.bank_accounts where user_id = p_borrower_id;
  select * into v_treasury from public.guild_treasuries where family_id = v_family_id;
  if v_account.id is null or v_treasury.id is null then
    raise exception '銀行口座またはギルド金庫が見つかりません';
  end if;

  v_treasury_available := greatest(
    0,
    v_treasury.balance - floor(v_treasury.total_supply * v_treasury.minimum_reserve_rate)::bigint
  );

  return query select
    v_account.loan_limit,
    v_account.loan_rate,
    v_account.loan_term_days,
    v_account.loan_balance,
    v_treasury_available,
    least(greatest(0, v_account.loan_limit - v_account.loan_balance), v_treasury_available),
    exists (
      select 1 from public.loans
      where borrower_id = p_borrower_id and status = 'active'
        and due_at < now()
        and (principal_repaid < principal_amount or interest_repaid < interest_amount)
    );
end;
$$;

create function public.update_loan_settings(
  p_borrower_id uuid,
  p_loan_limit bigint,
  p_monthly_interest_rate numeric,
  p_term_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  if p_loan_limit is null or p_loan_limit < 0 or p_loan_limit > 9007199254740991 then
    raise exception '限度額は0HMC以上の安全な整数で指定してください';
  end if;
  if p_monthly_interest_rate is null or p_monthly_interest_rate < 0 or p_monthly_interest_rate > 1 then
    raise exception '月利は0以上100%%以下で指定してください';
  end if;
  if p_term_days is null or p_term_days not between 1 and 3650 then
    raise exception '返済期限は1日以上3650日以下で指定してください';
  end if;

  select family_id into v_family_id from public.users where id = p_borrower_id and role = 'child';
  if not found or v_family_id is null then
    raise exception '設定対象の子どもが見つかりません';
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.users
    where id = auth.uid() and family_id = v_family_id and role = 'parent'
  ) then
    raise exception '同じ家庭の親だけがローン設定を変更できます';
  end if;

  update public.bank_accounts
  set loan_limit = p_loan_limit,
      loan_rate = p_monthly_interest_rate,
      loan_term_days = p_term_days,
      updated_at = now()
  where user_id = p_borrower_id;
  if not found then
    raise exception '銀行口座が見つかりません';
  end if;
end;
$$;

create function public.request_loan(
  p_borrower_id uuid,
  p_amount bigint,
  p_purpose text,
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
  v_offer record;
  v_existing public.loans%rowtype;
  v_loan_id uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_borrower_id then
    raise exception '子ども本人だけがローンを申請できます';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9007199254740991 then
    raise exception '申請額は1HMC以上の安全な整数で指定してください';
  end if;
  if p_purpose is null or length(btrim(p_purpose)) not between 1 and 500 then
    raise exception '用途を1文字以上500文字以下で入力してください';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;

  select * into v_existing from public.loans
  where request_idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.borrower_id is distinct from p_borrower_id
      or v_existing.requested_amount is distinct from p_amount
      or v_existing.purpose is distinct from btrim(p_purpose) then
      raise exception '同じidempotency_keyが別のローン申請に使用されています';
    end if;
    return v_existing.id;
  end if;

  select family_id, role into v_family_id, v_role
  from public.users where id = p_borrower_id;
  if not found or v_family_id is null or v_role <> 'child' then
    raise exception 'ローンを申請できる子どもの情報が見つかりません';
  end if;
  if exists (select 1 from public.loans where borrower_id = p_borrower_id and status = 'pending') then
    raise exception '承認待ちのローン申請があります';
  end if;
  if exists (
    select 1 from public.loans where borrower_id = p_borrower_id and status = 'active'
      and due_at < now()
      and (principal_repaid < principal_amount or interest_repaid < interest_amount)
  ) then
    raise exception '延滞中のローンがあるため新しく申請できません';
  end if;

  select * into v_offer from public.get_loan_offer(p_borrower_id);
  if p_amount > v_offer.available_amount then
    raise exception '現在の貸出可能額を超えています（貸出可能額: %HMC）', v_offer.available_amount;
  end if;

  insert into public.loans (
    family_id, borrower_id, requested_amount, purpose, request_idempotency_key
  ) values (
    v_family_id, p_borrower_id, p_amount, btrim(p_purpose), btrim(p_idempotency_key)
  )
  on conflict (request_idempotency_key) do nothing
  returning id into v_loan_id;

  if v_loan_id is null then
    select * into v_existing from public.loans
    where request_idempotency_key = btrim(p_idempotency_key);
    if not found
      or v_existing.borrower_id is distinct from p_borrower_id
      or v_existing.requested_amount is distinct from p_amount
      or v_existing.purpose is distinct from btrim(p_purpose) then
      raise exception '同じidempotency_keyが別のローン申請に使用されています';
    end if;
    v_loan_id := v_existing.id;
  end if;

  return v_loan_id;
end;
$$;

create function public.approve_loan(p_loan_id uuid, p_approver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan public.loans%rowtype;
  v_account public.bank_accounts%rowtype;
  v_interest bigint;
begin
  if auth.uid() is null or auth.uid() is distinct from p_approver_id then
    raise exception 'ログイン中の親本人だけがローンを承認できます';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then raise exception 'ローン申請が見つかりません'; end if;
  if not exists (
    select 1 from public.users
    where id = p_approver_id and family_id = v_loan.family_id and role = 'parent'
  ) then
    raise exception '同じ家庭の親だけがローンを承認できます';
  end if;
  if v_loan.status in ('active', 'paid') then return v_loan.id; end if;
  if v_loan.status <> 'pending' then raise exception '承認待ちではないローンです'; end if;
  if exists (
    select 1 from public.loans where borrower_id = v_loan.borrower_id and status = 'active'
      and due_at < now()
      and (principal_repaid < principal_amount or interest_repaid < interest_amount)
  ) then
    raise exception '延滞中のローンがあるため新しく貸し出せません';
  end if;

  -- 預入・引き出しと同じ users → bank_accounts の順でロックする。
  perform 1 from public.users where id = v_loan.borrower_id for update;

  select * into v_account from public.bank_accounts
  where user_id = v_loan.borrower_id for update;
  if v_account.id is null then raise exception '銀行口座が見つかりません'; end if;
  if v_loan.requested_amount > v_account.loan_limit - v_account.loan_balance then
    raise exception '個人限度額から未返済元本を引いた額を超えています';
  end if;

  v_interest := ceil(
    v_loan.requested_amount * v_account.loan_rate * v_account.loan_term_days / 30.0
  )::bigint;
  if v_interest > 9007199254740991 - v_loan.requested_amount then
    raise exception '返済総額が安全な整数の上限を超えます';
  end if;

  perform private.transfer_treasury_wallet(
    v_loan.family_id,
    v_loan.borrower_id,
    p_approver_id,
    v_loan.requested_amount,
    'treasury_to_wallet',
    'loan_disburse',
    v_loan.purpose,
    'loan-disburse:' || v_loan.id::text,
    'loan',
    v_loan.id
  );

  update public.bank_accounts
  set loan_balance = loan_balance + v_loan.requested_amount,
      loan_purpose = v_loan.purpose,
      updated_at = now()
  where id = v_account.id;

  update public.loans
  set status = 'active',
      monthly_interest_rate = v_account.loan_rate,
      term_days = v_account.loan_term_days,
      principal_amount = requested_amount,
      interest_amount = v_interest,
      approved_by = p_approver_id,
      approved_at = now(),
      due_at = now() + make_interval(days => v_account.loan_term_days),
      updated_at = now()
  where id = v_loan.id;

  return v_loan.id;
end;
$$;

create function public.reject_loan(p_loan_id uuid, p_approver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan public.loans%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_approver_id then
    raise exception 'ログイン中の親本人だけがローンを却下できます';
  end if;
  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then raise exception 'ローン申請が見つかりません'; end if;
  if not exists (
    select 1 from public.users
    where id = p_approver_id and family_id = v_loan.family_id and role = 'parent'
  ) then
    raise exception '同じ家庭の親だけがローンを却下できます';
  end if;
  if v_loan.status = 'rejected' then return v_loan.id; end if;
  if v_loan.status <> 'pending' then raise exception '承認待ちではないローンです'; end if;

  update public.loans
  set status = 'rejected', rejected_at = now(), updated_at = now()
  where id = v_loan.id;
  return v_loan.id;
end;
$$;

create function public.repay_loan(
  p_loan_id uuid,
  p_borrower_id uuid,
  p_amount bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan public.loans%rowtype;
  v_existing public.loan_repayments%rowtype;
  v_interest_remaining bigint;
  v_principal_remaining bigint;
  v_interest_payment bigint;
  v_principal_payment bigint;
  v_repayment_id uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_borrower_id then
    raise exception '借りた本人だけがローンを返済できます';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9007199254740991 then
    raise exception '返済額は1HMC以上の安全な整数で指定してください';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 180 then
    raise exception '有効なidempotency_keyを指定してください';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found or v_loan.borrower_id is distinct from p_borrower_id then
    raise exception '返済対象のローンが見つかりません';
  end if;

  select * into v_existing from public.loan_repayments
  where idempotency_key = btrim(p_idempotency_key);
  if found then
    if v_existing.loan_id is distinct from p_loan_id
      or v_existing.borrower_id is distinct from p_borrower_id
      or v_existing.amount is distinct from p_amount then
      raise exception '同じidempotency_keyが別の返済に使用されています';
    end if;
    return v_existing.id;
  end if;

  if v_loan.status <> 'active' then raise exception '返済可能なローンではありません'; end if;
  v_interest_remaining := v_loan.interest_amount - v_loan.interest_repaid;
  v_principal_remaining := v_loan.principal_amount - v_loan.principal_repaid;
  if p_amount > v_interest_remaining + v_principal_remaining then
    raise exception '返済額が残額を超えています（残額: %HMC）', v_interest_remaining + v_principal_remaining;
  end if;

  -- V1では未返済利息を先に充当し、残りを元本へ充当する。
  v_interest_payment := least(p_amount, v_interest_remaining);
  v_principal_payment := p_amount - v_interest_payment;

  if v_interest_payment > 0 then
    perform private.transfer_treasury_wallet(
      v_loan.family_id, p_borrower_id, p_borrower_id, v_interest_payment,
      'wallet_to_treasury', 'loan_interest', 'ローン利息の返済',
      btrim(p_idempotency_key) || ':interest', 'loan', v_loan.id
    );
  end if;
  if v_principal_payment > 0 then
    perform private.transfer_treasury_wallet(
      v_loan.family_id, p_borrower_id, p_borrower_id, v_principal_payment,
      'wallet_to_treasury', 'loan_repay_principal', 'ローン元本の返済',
      btrim(p_idempotency_key) || ':principal', 'loan', v_loan.id
    );
  end if;

  insert into public.loan_repayments (
    family_id, loan_id, borrower_id, amount,
    principal_amount, interest_amount, idempotency_key
  ) values (
    v_loan.family_id, v_loan.id, p_borrower_id, p_amount,
    v_principal_payment, v_interest_payment, btrim(p_idempotency_key)
  ) returning id into v_repayment_id;

  update public.bank_accounts
  set loan_balance = loan_balance - v_principal_payment,
      loan_purpose = case
        when loan_balance - v_principal_payment = 0 then null else loan_purpose
      end,
      updated_at = now()
  where user_id = p_borrower_id;

  update public.loans
  set principal_repaid = principal_repaid + v_principal_payment,
      interest_repaid = interest_repaid + v_interest_payment,
      status = case
        when principal_repaid + v_principal_payment = principal_amount
          and interest_repaid + v_interest_payment = interest_amount
        then 'paid' else 'active'
      end,
      completed_at = case
        when principal_repaid + v_principal_payment = principal_amount
          and interest_repaid + v_interest_payment = interest_amount
        then now() else null
      end,
      updated_at = now()
  where id = v_loan.id;

  return v_repayment_id;
end;
$$;

revoke all on function public.get_loan_offer(uuid) from public, anon;
revoke all on function public.update_loan_settings(uuid, bigint, numeric, integer) from public, anon;
revoke all on function public.request_loan(uuid, bigint, text, text) from public, anon;
revoke all on function public.approve_loan(uuid, uuid) from public, anon;
revoke all on function public.reject_loan(uuid, uuid) from public, anon;
revoke all on function public.repay_loan(uuid, uuid, bigint, text) from public, anon;

grant execute on function public.get_loan_offer(uuid) to authenticated;
grant execute on function public.update_loan_settings(uuid, bigint, numeric, integer) to authenticated;
grant execute on function public.request_loan(uuid, bigint, text, text) to authenticated;
grant execute on function public.approve_loan(uuid, uuid) to authenticated;
grant execute on function public.reject_loan(uuid, uuid) to authenticated;
grant execute on function public.repay_loan(uuid, uuid, bigint, text) to authenticated;

-- 旧RPCは履歴との互換性のためDB上に残すが、アプリから直接借入・返済できないようにする。
revoke execute on function public.bank_borrow(uuid, numeric) from authenticated;
revoke execute on function public.bank_repay(uuid, numeric) from authenticated;
