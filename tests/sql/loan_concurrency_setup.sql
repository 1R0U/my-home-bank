\set ON_ERROR_STOP on

insert into public.families (id, name)
values ('e1000000-0000-4000-8000-000000000001', 'ローン並行検証家族');
insert into public.users (id, family_id, name, role, balance) values
  ('e1000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('e1000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000001', '子', 'child', 0);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values ('e1000000-0000-4000-8000-000000000001', 1000, 1000, 1000, 0.2000);
update public.bank_accounts
set loan_limit = 500, loan_rate = 0.05, loan_term_days = 30
where user_id = 'e1000000-0000-4000-8000-000000000012';

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000012', true);
select public.request_loan(
  'e1000000-0000-4000-8000-000000000012',
  100,
  '並行承認検証',
  'loan-concurrent-request'
);

create function public.delay_concurrent_loan_disbursement()
returns trigger language plpgsql as $$
begin
  if new.type = 'loan_disburse'
    and new.related_id = 'e1000000-0000-4000-8000-000000000031'::uuid then
    perform pg_sleep(10);
  end if;
  return new;
end;
$$;

-- テストスクリプトから固定IDで承認できるようにする。
update public.loans
set id = 'e1000000-0000-4000-8000-000000000031'
where request_idempotency_key = 'loan-concurrent-request';

create trigger delay_concurrent_loan_disbursement
before insert on public.economy_transactions
for each row execute function public.delay_concurrent_loan_disbursement();
