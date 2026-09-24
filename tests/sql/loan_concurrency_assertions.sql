\set ON_ERROR_STOP on

do $$
declare
  v_loan public.loans%rowtype;
  v_wallet numeric;
  v_treasury bigint;
  v_bank_balance bigint;
  v_transaction_count integer;
begin
  select * into v_loan from public.loans
  where id = 'e1000000-0000-4000-8000-000000000031';
  select balance into v_wallet from public.users
  where id = 'e1000000-0000-4000-8000-000000000012';
  select balance into v_treasury from public.guild_treasuries
  where family_id = 'e1000000-0000-4000-8000-000000000001';
  select loan_balance into v_bank_balance from public.bank_accounts
  where user_id = 'e1000000-0000-4000-8000-000000000012';
  select count(*) into v_transaction_count from public.economy_transactions
  where related_id = v_loan.id and type = 'loan_disburse';

  if v_loan.status <> 'active'
    or v_wallet <> 100
    or v_treasury <> 900
    or v_bank_balance <> 100
    or v_transaction_count <> 1 then
    raise exception '並行承認で二重貸出が発生しました: loan=%, wallet=%, treasury=%, bank=%, tx=%',
      v_loan.status, v_wallet, v_treasury, v_bank_balance, v_transaction_count;
  end if;
end;
$$;
