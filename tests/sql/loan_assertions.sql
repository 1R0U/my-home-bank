-- Issue #160: 金利付きローンの金額・期限・認可・冪等性を実DBで検証する。
\set ON_ERROR_STOP on

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
declare v_message text; v_sqlstate text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text, v_sqlstate = returned_sqlstate;
    if v_sqlstate <> 'P0001' or v_message is distinct from p_expected then
      raise exception '想定外のエラー（%）: [%] %', p_label, v_sqlstate, v_message;
    end if;
    return;
  end;
  raise exception 'アサーション失敗（拒否されるはずが成功）: %', p_label;
end;
$$;

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.request_loan(uuid,bigint,text,numeric,integer,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.approve_loan(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.repay_loan(uuid,uuid,bigint,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.request_loan(uuid,bigint,text,numeric,integer,text)', 'EXECUTE'),
  'ローンRPCは認証済み利用者だけが実行できる'
);
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.bank_borrow(uuid,numeric)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.bank_repay(uuid,numeric)', 'EXECUTE'),
  '旧直接借入・返済RPCをアプリから実行できない'
);

insert into public.families (id, name) values
  ('d0000000-0000-4000-8000-000000000001', 'ローン検証家族A'),
  ('d0000000-0000-4000-8000-000000000002', 'ローン検証家族B');
insert into public.users (id, family_id, name, role, balance) values
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', '親A', 'parent', 0),
  ('d0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', '子A', 'child', 100),
  ('d0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000001', '子A2', 'child', 20),
  ('d0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000002', '親B', 'parent', 0);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
values
  ('d0000000-0000-4000-8000-000000000001', 800, 1000, 1000, 0.2000),
  ('d0000000-0000-4000-8000-000000000002', 100, 100, 100, 0.2000);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000011', true);
select public.update_loan_settings(
  'd0000000-0000-4000-8000-000000000012', 500, 0.05, 30
);
select public.update_loan_settings(
  'd0000000-0000-4000-8000-000000000013', 40, 0.05, 30
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000013', true);
select pg_temp.assert_rejected(
  $$select public.request_loan(
    'd0000000-0000-4000-8000-000000000013', 41, '限度額超過', 0.05, 30, 'loan-limit-over'
  )$$,
  '現在の貸出可能額を超えています（貸出可能額: 40ゴル）',
  '個人限度額を超える申請'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  $$select public.request_loan(
    'd0000000-0000-4000-8000-000000000012', 100, '古い条件の申請', 0.20, 60, 'loan-stale-offer'
  )$$,
  'ローン条件が変更されました。内容を確認してもう一度申請してください',
  '画面表示後に変更された貸出条件での申請'
);
select public.request_loan(
  'd0000000-0000-4000-8000-000000000012', 100, 'ゲーム購入', 0.05, 30, 'loan-request-main'
) as loan_id \gset
select pg_temp.assert(
  public.request_loan(
    'd0000000-0000-4000-8000-000000000012', 100, 'ゲーム購入', 0.05, 30, 'loan-request-main'
  ) = :'loan_id'::uuid,
  '申請の再送が同じローンIDを返す'
);

-- 申請後に設定を変えても、子どもが確認した月利・期限で契約される。
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000011', true);
select public.update_loan_settings(
  'd0000000-0000-4000-8000-000000000012', 500, 0.05123456, 30
);
select pg_temp.assert(
  (select loan_rate = 0.051235 from public.bank_accounts where user_id = 'd0000000-0000-4000-8000-000000000012'),
  '月利を小数6桁へ丸めて保存する'
);
select public.update_loan_settings(
  'd0000000-0000-4000-8000-000000000012', 500, 0.20, 60
);
select pg_temp.assert(
  (select monthly_interest_rate = 0.05 and term_days = 30 from public.loans where id = :'loan_id'),
  '申請後の設定変更で申請条件が変わらない'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected(
  format(
    'select public.approve_loan(%L, %L)',
    :'loan_id', 'd0000000-0000-4000-8000-000000000021'
  ),
  '同じ家庭の親だけがローンを承認できます',
  '他家庭の親による承認'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000011', true);
select pg_temp.assert(
  public.approve_loan(:'loan_id', 'd0000000-0000-4000-8000-000000000011') = :'loan_id'::uuid,
  '親がローンを承認できる'
);
select pg_temp.assert(
  public.approve_loan(:'loan_id', 'd0000000-0000-4000-8000-000000000011') = :'loan_id'::uuid,
  '承認の再送が同じローンIDを返す'
);

do $$
declare v_loan public.loans%rowtype; v_wallet numeric; v_treasury bigint; v_balance bigint; v_count integer;
begin
  select * into v_loan from public.loans where request_idempotency_key = 'loan-request-main';
  select balance into v_wallet from public.users where id = v_loan.borrower_id;
  select balance into v_treasury from public.guild_treasuries where family_id = v_loan.family_id;
  select loan_balance into v_balance from public.bank_accounts where user_id = v_loan.borrower_id;
  select count(*) into v_count from public.economy_transactions
    where related_id = v_loan.id and type = 'loan_disburse';
  perform pg_temp.assert(v_loan.status = 'active', '承認後は契約中になる');
  perform pg_temp.assert(v_loan.monthly_interest_rate = 0.05, '月利5%を契約へ固定する');
  perform pg_temp.assert(v_loan.term_days = 30 and v_loan.interest_amount = 5, '30日単利5ゴルになる');
  perform pg_temp.assert(v_loan.due_at between v_loan.approved_at + interval '29 days 23 hours' and v_loan.approved_at + interval '30 days 1 hour', '期限が承認から30日になる');
  perform pg_temp.assert(v_wallet = 200 and v_treasury = 700 and v_balance = 100, '金庫からWalletへ元本だけを移す');
  perform pg_temp.assert(v_count = 1, '承認再送でも貸出台帳は1件だけになる');
end;
$$;

select pg_temp.assert(
  (select monthly_interest_rate = 0.05 and term_days = 30 from public.loans where id = :'loan_id'),
  '承認時も申請条件が維持される'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000012', true);
select public.repay_loan(
  :'loan_id', 'd0000000-0000-4000-8000-000000000012', 3, 'loan-repay-one'
) as repayment_one \gset
select pg_temp.assert(
  (select interest_repaid = 3 and principal_repaid = 0 from public.loans where id = :'loan_id'),
  '任意額返済は利息から充当する'
);

select public.repay_loan(
  :'loan_id', 'd0000000-0000-4000-8000-000000000012', 102, 'loan-repay-two'
) as repayment_two \gset
select pg_temp.assert(
  public.repay_loan(
    :'loan_id', 'd0000000-0000-4000-8000-000000000012', 102, 'loan-repay-two'
  ) = :'repayment_two'::uuid,
  '返済の再送が同じ返済IDを返す'
);

do $$
declare v_loan public.loans%rowtype; v_wallet numeric; v_treasury bigint; v_balance bigint; v_principal_count integer; v_interest_count integer;
begin
  select * into v_loan from public.loans where request_idempotency_key = 'loan-request-main';
  select balance into v_wallet from public.users where id = v_loan.borrower_id;
  select balance into v_treasury from public.guild_treasuries where family_id = v_loan.family_id;
  select loan_balance into v_balance from public.bank_accounts where user_id = v_loan.borrower_id;
  select count(*) into v_principal_count from public.economy_transactions
    where related_id = v_loan.id and type = 'loan_repay_principal' and amount = 100;
  select count(*) into v_interest_count from public.economy_transactions
    where related_id = v_loan.id and type = 'loan_interest';
  perform pg_temp.assert(v_loan.status = 'paid' and v_loan.completed_at is not null, '全額返済で完済になる');
  perform pg_temp.assert(v_wallet = 95 and v_treasury = 805 and v_balance = 0, '元本と利息が金庫へ戻る');
  perform pg_temp.assert(v_principal_count = 1 and v_interest_count = 2, '元本と利息を別種別で記帳する');
end;
$$;

-- 新設定（月利20%、60日）の契約を作り、過払いと延滞中の新規申請を拒否する。
select public.request_loan(
  'd0000000-0000-4000-8000-000000000012', 50, '延滞検証', 0.20, 60, 'loan-request-overdue'
) as overdue_loan_id \gset
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000011', true);
select public.approve_loan(:'overdue_loan_id', 'd0000000-0000-4000-8000-000000000011');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  format(
    'select public.repay_loan(%L, %L, 71, %L)',
    :'overdue_loan_id', 'd0000000-0000-4000-8000-000000000012', 'loan-overpay'
  ),
  '返済額が残額を超えています（残額: 70ゴル）',
  '過払い'
);
update public.loans set due_at = now() - interval '1 day' where id = :'overdue_loan_id';
select pg_temp.assert_rejected(
  $$select public.request_loan(
    'd0000000-0000-4000-8000-000000000012', 1, '延滞中の追加申請', 0.20, 60, 'loan-request-blocked'
  )$$,
  '延滞中のローンがあるため新しく申請できません',
  '延滞中の新規借入'
);

rollback;
