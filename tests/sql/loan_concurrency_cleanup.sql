\set ON_ERROR_STOP on

drop trigger if exists delay_concurrent_loan_disbursement on public.economy_transactions;
drop function if exists public.delay_concurrent_loan_disbursement();
delete from public.economy_transactions where family_id = 'e1000000-0000-4000-8000-000000000001';
delete from public.loan_repayments where family_id = 'e1000000-0000-4000-8000-000000000001';
delete from public.loans where family_id = 'e1000000-0000-4000-8000-000000000001';
delete from public.guild_treasuries where family_id = 'e1000000-0000-4000-8000-000000000001';
delete from public.bank_accounts where user_id in (
  'e1000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000012'
);
delete from public.users where family_id = 'e1000000-0000-4000-8000-000000000001';
delete from public.families where id = 'e1000000-0000-4000-8000-000000000001';
