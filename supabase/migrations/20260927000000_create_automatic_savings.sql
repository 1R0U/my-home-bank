-- Issue #162: 手動預金と独立した自動積立。家庭の暦は日本時間。
create table public.savings_settings (
  family_id uuid primary key references public.families(id) on delete restrict,
  transfer_day integer not null default 1 check (transfer_day between 1 and 31)
);
create table public.savings_accounts (
  user_id uuid primary key references public.users(id) on delete restrict,
  family_id uuid not null references public.families(id) on delete restrict,
  balance bigint not null default 0 check (balance between 0 and 9007199254740991),
  monthly_amount bigint not null default 0 check (monthly_amount between 0 and 9007199254740991),
  next_transfer_month date not null,
  created_at timestamptz not null default now()
);
create table public.savings_monthly_runs (
  family_id uuid not null references public.families(id) on delete restrict,
  user_id uuid not null references public.savings_accounts(user_id) on delete restrict,
  target_month date not null,
  kind text not null check (kind in ('transfer', 'interest')),
  requested_amount bigint not null check (requested_amount between 0 and 9007199254740991),
  amount bigint not null check (amount between 0 and requested_amount),
  status text not null check (status in ('completed', 'partial', 'empty', 'stopped', 'reserve', 'rounded_zero')),
  average_balance numeric,
  monthly_rate numeric,
  created_at timestamptz not null default now(),
  primary key(user_id, target_month, kind)
);
-- 家庭全員の利息は同一の金庫比率を使い、準備金不足なら全員分を見送る。
create table public.savings_interest_months (
  family_id uuid not null references public.families(id) on delete restrict,
  target_month date not null,
  treasury_balance bigint not null,
  total_supply bigint not null,
  monthly_rate numeric not null,
  created_at timestamptz not null default now(),
  primary key(family_id, target_month)
);
alter table public.savings_settings enable row level security;
alter table public.savings_accounts enable row level security;
alter table public.savings_monthly_runs enable row level security;
alter table public.savings_interest_months enable row level security;
revoke all on public.savings_settings, public.savings_accounts,
  public.savings_monthly_runs, public.savings_interest_months from anon, authenticated;

create function private.savings_rate(p_balance numeric, p_supply numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_supply <= 0 then 0
    when p_balance * 100 >= p_supply * 50 then 0.01
    when p_balance * 100 >= p_supply * 30 then 0.005
    when p_balance * 100 >= p_supply * 20 then 0.0025 else 0 end;
$$;
create function private.savings_due_date(p_month date, p_day integer)
returns date language sql immutable set search_path = '' as $$
  select least(p_month + (p_day - 1), (p_month + interval '1 month - 1 day')::date);
$$;
-- 各入出金が月末まで存在した秒数を重みとする時間加重平均。
-- 初期残高は0で、利息以外の全入出金を経済台帳へ記録するため後から再現できる。
-- 単利とするため、過去に支払った利息は翌月以降の平均残高へ含めない。
create function private.savings_average(p_user uuid, p_month date, p_until timestamptz)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(
    (case when t.to_account_type = 'savings' then t.amount else -t.amount end)::numeric
    * extract(epoch from (least(p_until, private.family_month_start((p_month + interval '1 month')::date))
      - greatest(t.created_at, private.family_month_start(p_month))))
  ), 0) / extract(epoch from (private.family_month_start((p_month + interval '1 month')::date)
    - private.family_month_start(p_month)))
  from public.economy_transactions t
  where ((t.to_account_type = 'savings' and t.to_user_id = p_user)
    or (t.from_account_type = 'savings' and t.from_user_id = p_user))
    and t.type <> 'savings_interest'
    and t.created_at < least(p_until, private.family_month_start((p_month + interval '1 month')::date));
$$;

-- 同じ家庭の積立操作を直列化し、既存の送金と同じ users → 金庫 の順にロックする。
create function private.lock_savings_family(p_family uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('savings:' || p_family::text, 0));
  perform 1 from public.users where family_id = p_family order by id for update;
  perform 1 from public.guild_treasuries where family_id = p_family for update;
  if not found then raise exception 'ギルド金庫が見つかりません'; end if;
  insert into public.savings_settings(family_id) values(p_family) on conflict do nothing;
end;
$$;

create function private.record_savings_movement(
  p_family uuid, p_user uuid, p_amount bigint, p_kind text, p_key text, p_at timestamptz
)
returns void language plpgsql set search_path = '' as $$
declare v_description text;
begin
  if p_amount <= 0 then return; end if;
  v_description := case p_kind when 'savings_auto_transfer' then '自動積立預金への積立'
    when 'savings_withdraw' then '自動積立預金からの引き出し' else '自動積立預金の利息' end;
  insert into public.economy_transactions(family_id, actor_user_id, type,
    from_account_type, from_user_id, to_account_type, to_user_id,
    amount, description, idempotency_key, created_at)
  values(p_family, auth.uid(), p_kind,
    case p_kind when 'savings_interest' then 'treasury' when 'savings_withdraw' then 'savings' else 'wallet' end,
    case when p_kind = 'savings_interest' then null else p_user end,
    case when p_kind = 'savings_withdraw' then 'wallet' else 'savings' end, p_user,
    p_amount, v_description, p_key, p_at);
  -- 既存の履歴画面でも確認できるよう、振替・収入の既存分類で記帳する。
  insert into public.transactions(user_id, type, description, amount, created_at)
  values(p_user, case p_kind when 'savings_auto_transfer' then 'bank_deposit'
    when 'savings_withdraw' then 'bank_withdraw' else 'bank_interest' end,
    v_description, case when p_kind = 'savings_auto_transfer' then -p_amount else p_amount end, p_at);
end;
$$;

create function private.process_savings_family(p_family uuid, p_at timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  v_month date := private.family_calendar_month(p_at);
  v_date date := (p_at at time zone 'Asia/Tokyo')::date;
  v_target date; v_day integer; v_rate numeric; v_total numeric;
  v_average numeric; v_requested bigint; v_amount bigint; v_wallet numeric;
  v_status text; v_treasury public.guild_treasuries%rowtype;
  v_account public.savings_accounts%rowtype;
begin
  perform private.lock_savings_family(p_family);
  select transfer_day into v_day from public.savings_settings where family_id = p_family;
  -- 未処理の過去月を古い順に確定。遅延しても入金時刻は実際の処理時刻とする。
  for v_target in
    select m::date from generate_series(
      (select min(private.family_calendar_month(created_at)) from public.savings_accounts where family_id = p_family),
      (v_month - interval '1 month')::date, interval '1 month') m
    where not exists(select 1 from public.savings_interest_months s where s.family_id = p_family and s.target_month = m::date)
  loop
    select * into v_treasury from public.guild_treasuries where family_id = p_family;
    v_rate := private.savings_rate(v_treasury.balance, v_treasury.total_supply);
    select coalesce(sum(floor(private.savings_average(user_id, v_target,
      private.family_month_start((v_target + interval '1 month')::date)) * v_rate)), 0)
      into v_total from public.savings_accounts where family_id = p_family
      and created_at < private.family_month_start((v_target + interval '1 month')::date);
    insert into public.savings_interest_months(family_id, target_month, treasury_balance, total_supply, monthly_rate, created_at)
      values(p_family, v_target, v_treasury.balance, v_treasury.total_supply, v_rate, p_at);
    for v_account in select * from public.savings_accounts where family_id = p_family
      and created_at < private.family_month_start((v_target + interval '1 month')::date) order by user_id
    loop
      v_average := private.savings_average(v_account.user_id, v_target,
        private.family_month_start((v_target + interval '1 month')::date));
      v_requested := floor(v_average * v_rate);
      v_amount := v_requested;
      v_status := case when v_requested = 0 then 'rounded_zero' else 'completed' end;
      if v_total > greatest(0, v_treasury.balance - floor(v_treasury.total_supply * v_treasury.minimum_reserve_rate)) then
        v_amount := 0; v_status := 'reserve';
      end if;
      update public.savings_accounts set balance = balance + v_amount where user_id = v_account.user_id;
      update public.guild_treasuries set balance = balance - v_amount, updated_at = p_at where family_id = p_family;
      insert into public.savings_monthly_runs(family_id, user_id, target_month, kind, requested_amount,
        amount, status, average_balance, monthly_rate, created_at)
        values(p_family, v_account.user_id, v_target, 'interest', v_requested, v_amount, v_status, v_average, v_rate, p_at);
      perform private.record_savings_movement(p_family, v_account.user_id, v_amount, 'savings_interest',
        'savings:interest:' || v_account.user_id || ':' || v_target, p_at);
    end loop;
  end loop;
  for v_account in select * from public.savings_accounts where family_id = p_family order by user_id
  loop
    -- 停止中の過去月も記録する。再実行で残高が増えても部分積立を追加実行しない。
    while private.savings_due_date(v_account.next_transfer_month, v_day) <= v_date loop
      select balance into v_wallet from public.users where id = v_account.user_id;
      if v_wallet < 0 or v_wallet <> trunc(v_wallet) or v_wallet > private.safe_integer_max() then
        raise exception 'お財布残高が安全な整数ではありません';
      end if;
      v_requested := v_account.monthly_amount;
      v_amount := least(v_requested, v_wallet, private.safe_integer_max() - v_account.balance);
      v_status := case when v_requested = 0 then 'stopped' when v_amount = 0 then 'empty'
        when v_amount < v_requested then 'partial' else 'completed' end;
      update public.users set balance = balance - v_amount where id = v_account.user_id;
      update public.savings_accounts set balance = balance + v_amount,
        next_transfer_month = (next_transfer_month + interval '1 month')::date where user_id = v_account.user_id;
      insert into public.savings_monthly_runs(family_id, user_id, target_month, kind, requested_amount, amount, status, created_at)
        values(p_family, v_account.user_id, v_account.next_transfer_month, 'transfer', v_requested, v_amount, v_status, p_at);
      perform private.record_savings_movement(p_family, v_account.user_id, v_amount, 'savings_auto_transfer',
        'savings:transfer:' || v_account.user_id || ':' || v_account.next_transfer_month, p_at);
      v_account.balance := v_account.balance + v_amount;
      v_account.next_transfer_month := (v_account.next_transfer_month + interval '1 month')::date;
    end loop;
  end loop;
end;
$$;

create function public.set_savings_amount(p_amount bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_day integer; v_month date := private.family_calendar_month(now());
begin
  select family_id into v_family from public.users where id = auth.uid() and role = 'child';
  if v_family is null then raise exception '家庭に所属する子どもだけが積立額を設定できます'; end if;
  if p_amount is null or p_amount < 0 or p_amount > private.safe_integer_max() then
    raise exception '積立額は0以上の安全な整数で指定してください'; end if;
  perform private.process_savings_family(v_family, now());
  select transfer_day into v_day from public.savings_settings where family_id = v_family;
  if private.savings_due_date(v_month, v_day) < (now() at time zone 'Asia/Tokyo')::date then
    v_month := (v_month + interval '1 month')::date;
  end if;
  insert into public.savings_accounts(user_id, family_id, monthly_amount, next_transfer_month)
    values(auth.uid(), v_family, p_amount, v_month)
    on conflict(user_id) do update set monthly_amount = excluded.monthly_amount;
  perform private.process_savings_family(v_family, now());
end;
$$;

create function public.set_savings_day(p_day integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid;
begin
  select family_id into v_family from public.users where id = auth.uid() and role = 'parent';
  if v_family is null then raise exception '家庭に所属する親だけが積立日を設定できます'; end if;
  if p_day is null or p_day not between 1 and 31 then raise exception '積立日は1〜31で指定してください'; end if;
  perform private.process_savings_family(v_family, now());
  update public.savings_settings set transfer_day = p_day where family_id = v_family;
  perform private.process_savings_family(v_family, now());
end;
$$;

create function public.withdraw_savings(p_amount bigint, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_account public.savings_accounts%rowtype; v_existing public.economy_transactions%rowtype;
begin
  select family_id into v_family from public.users where id = auth.uid() and role = 'child';
  if v_family is null then raise exception '自分の積立預金だけ引き出せます'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > private.safe_integer_max() then
    raise exception '引き出し額は1以上の安全な整数で指定してください'; end if;
  if p_key is null or length(btrim(p_key)) not between 1 and 100 then raise exception '操作キーが不正です'; end if;
  perform private.process_savings_family(v_family, now());
  select * into v_existing from public.economy_transactions
    where idempotency_key = 'savings:withdraw:' || auth.uid() || ':' || btrim(p_key);
  if found then
    if v_existing.amount <> p_amount or v_existing.family_id <> v_family then
      raise exception '操作キーが別の引き出しに使用されています'; end if;
    return;
  end if;
  select * into v_account from public.savings_accounts where user_id = auth.uid() and family_id = v_family;
  if not found or v_account.balance < p_amount then raise exception '積立預金が不足しています'; end if;
  if (select balance from public.users where id = auth.uid()) > private.safe_integer_max() - p_amount then
    raise exception 'お財布残高が安全な整数の上限を超えます'; end if;
  update public.savings_accounts set balance = balance - p_amount where user_id = auth.uid();
  update public.users set balance = balance + p_amount where id = auth.uid();
  perform private.record_savings_movement(v_family, auth.uid(), p_amount, 'savings_withdraw',
    'savings:withdraw:' || auth.uid() || ':' || btrim(p_key), now());
end;
$$;

create function public.get_savings_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_role text; v_day integer; v_rate numeric;
  v_month date := private.family_calendar_month(now()); v_accounts jsonb;
begin
  select family_id, role into v_family, v_role from public.users where id = auth.uid();
  if v_family is null then raise exception '家族に所属していません'; end if;
  perform private.process_savings_family(v_family, now());
  select transfer_day into v_day from public.savings_settings where family_id = v_family;
  select private.savings_rate(balance, total_supply) into v_rate from public.guild_treasuries where family_id = v_family;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id, 'name', u.name, 'balance', coalesce(a.balance, 0),
    'monthly_amount', coalesce(a.monthly_amount, 0),
    'next_transfer_date', case when a.monthly_amount > 0 then private.savings_due_date(a.next_transfer_month, v_day) else null end,
    'estimated_interest', floor((private.savings_average(u.id, v_month, now())
      + coalesce(a.balance, 0) * extract(epoch from (private.family_month_start((v_month + interval '1 month')::date) - now()))
      / extract(epoch from (private.family_month_start((v_month + interval '1 month')::date) - private.family_month_start(v_month)))) * v_rate),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.target_month desc, h.kind), '[]'::jsonb)
      from (select * from public.savings_monthly_runs r where r.user_id = u.id order by target_month desc, kind limit 12) h)
  ) order by u.created_at, u.id), '[]'::jsonb) into v_accounts
  from public.users u left join public.savings_accounts a on a.user_id = u.id
  where u.family_id = v_family and u.role = 'child' and (v_role = 'parent' or u.id = auth.uid());
  return jsonb_build_object('transfer_day', v_day, 'monthly_rate', v_rate, 'accounts', v_accounts);
end;
$$;

-- cron所有者だけが実行する。失敗時は全体をロールバックし、次回実行で安全に再試行する。
create function private.run_savings_schedule()
returns void language plpgsql set search_path = '' as $$
declare v_family uuid;
begin
  for v_family in select distinct family_id from public.savings_accounts order by family_id loop
    perform private.process_savings_family(v_family, now());
  end loop;
end;
$$;
revoke all on function private.savings_rate(numeric,numeric), private.savings_due_date(date,integer),
  private.savings_average(uuid,date,timestamptz), private.lock_savings_family(uuid),
  private.record_savings_movement(uuid,uuid,bigint,text,text,timestamptz),
  private.process_savings_family(uuid,timestamptz), private.run_savings_schedule() from public, anon, authenticated;
revoke all on function public.set_savings_amount(bigint), public.set_savings_day(integer),
  public.withdraw_savings(bigint,text), public.get_savings_summary() from public, anon;
grant execute on function public.set_savings_amount(bigint), public.set_savings_day(integer),
  public.withdraw_savings(bigint,text), public.get_savings_summary() to authenticated;
