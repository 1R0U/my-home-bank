-- Issue #162: 実DBで原子性・平均残高・月境界・権限・再実行を確認する。
\set ON_ERROR_STOP on
begin;
create function pg_temp.savings_assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception '積立テスト失敗: %', p_label; end if;
end;
$$;

select pg_temp.savings_assert(private.savings_rate(199,1000) = 0, '20%直前');
select pg_temp.savings_assert(private.savings_rate(200,1000) = .0025, '20%');
select pg_temp.savings_assert(private.savings_rate(299,1000) = .0025, '30%直前');
select pg_temp.savings_assert(private.savings_rate(300,1000) = .005, '30%');
select pg_temp.savings_assert(private.savings_rate(499,1000) = .005, '50%直前');
select pg_temp.savings_assert(private.savings_rate(500,1000) = .01, '50%');
select pg_temp.savings_assert(private.savings_rate(0,0) = 0, '供給なし');
select pg_temp.savings_assert(private.savings_rate(4503599627370495,9007199254740991) = .005, '安全整数上限の比率');
select pg_temp.savings_assert(private.savings_due_date('2040-02-01',31) = '2040-02-29', '閏年の月末');
select pg_temp.savings_assert(private.savings_due_date('2041-02-01',31) = '2041-02-28', '平年の月末');
select pg_temp.savings_assert(not has_function_privilege('anon','public.withdraw_savings(bigint,text)','execute'), '匿名引き出し禁止');
select pg_temp.savings_assert(not has_function_privilege('authenticated','private.process_savings_family(uuid,timestamptz)','execute'), '時刻指定の直接実行禁止');
select pg_temp.savings_assert(not has_table_privilege('authenticated','public.savings_accounts','update'), '残高直接更新禁止');

insert into public.families(id,name) values
 ('e1620000-0000-4000-8000-000000000001','積立テストA'),
 ('e1620000-0000-4000-8000-000000000002','積立テストB'),
 ('e1620000-0000-4000-8000-000000000003','積立テストC');
insert into public.users(id,family_id,name,role,balance) values
 ('e1620000-0000-4000-8000-000000000011','e1620000-0000-4000-8000-000000000001','親','parent',0),
 ('e1620000-0000-4000-8000-000000000012','e1620000-0000-4000-8000-000000000001','子','child',1000),
 ('e1620000-0000-4000-8000-000000000013','e1620000-0000-4000-8000-000000000001','子2','child',30),
 ('e1620000-0000-4000-8000-000000000021','e1620000-0000-4000-8000-000000000002','別家庭の親','parent',0),
 ('e1620000-0000-4000-8000-000000000031','e1620000-0000-4000-8000-000000000003','読取テスト親','parent',0);
insert into public.guild_treasuries(family_id,balance,initial_supply,total_supply) values
 ('e1620000-0000-4000-8000-000000000001',8970,10000,10000),
 ('e1620000-0000-4000-8000-000000000002',1000,1000,1000),
 ('e1620000-0000-4000-8000-000000000003',1000,1000,1000);
insert into public.savings_settings(family_id,transfer_day) values('e1620000-0000-4000-8000-000000000001',16);
insert into public.savings_accounts(user_id,family_id,monthly_amount,next_transfer_month,created_at) values
 ('e1620000-0000-4000-8000-000000000012','e1620000-0000-4000-8000-000000000001',600,'2040-04-01','2040-03-31T15:00Z'),
 ('e1620000-0000-4000-8000-000000000013','e1620000-0000-4000-8000-000000000001',100,'2040-04-01','2040-03-31T15:00Z');

select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-04-15T14:59:59Z');
select pg_temp.savings_assert((select count(*) = 0 from public.savings_monthly_runs where family_id='e1620000-0000-4000-8000-000000000001'), '積立日前は未実行');
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-04-15T15:00Z');
select pg_temp.savings_assert((select balance=600 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000012'), '指定日の積立');
select pg_temp.savings_assert((select balance=0 from public.users where id='e1620000-0000-4000-8000-000000000013'), '不足時に借金を作らない');
select pg_temp.savings_assert((select status='partial' and amount=30 from public.savings_monthly_runs where user_id='e1620000-0000-4000-8000-000000000013' and kind='transfer'), '部分積立');
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-04-20T15:00Z');
select pg_temp.savings_assert((select balance=600 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000012'), '再実行は同額');
select pg_temp.savings_assert(private.savings_average('e1620000-0000-4000-8000-000000000012','2040-04-01','2040-04-30T15:00Z')=300, '月の後半15日間の600は平均300');

select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-04-30T15:00Z');
select pg_temp.savings_assert((select balance=603 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000012'), '平均300の月利1%は3');
select pg_temp.savings_assert((select amount=0 and status='rounded_zero' from public.savings_monthly_runs where user_id='e1620000-0000-4000-8000-000000000013' and kind='interest'), '1ゴル未満切捨て');
select pg_temp.savings_assert((select balance=8967 from public.guild_treasuries where family_id='e1620000-0000-4000-8000-000000000001'), '利息の原資は金庫');
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-05-01T15:00Z');
select pg_temp.savings_assert((select balance=603 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000012'), '利息二重支払なし');
select pg_temp.savings_assert(private.savings_average('e1620000-0000-4000-8000-000000000012','2040-05-01','2040-05-31T15:00Z')=600, '前月の利息を翌月の平均残高へ含めない');
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-05-15T15:00Z');
select pg_temp.savings_assert((select amount=0 and status='empty' from public.savings_monthly_runs where user_id='e1620000-0000-4000-8000-000000000013' and kind='transfer' and target_month='2040-05-01'), 'お財布0はスキップ');

-- 金庫が最低準備金ちょうどなら、利息を支払わない。
update public.guild_treasuries set minimum_reserve_rate=balance::numeric/total_supply where family_id='e1620000-0000-4000-8000-000000000001';
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-05-31T15:00Z');
select pg_temp.savings_assert((select amount=0 and status='reserve' from public.savings_monthly_runs where user_id='e1620000-0000-4000-8000-000000000012' and kind='interest' and target_month='2040-05-01'), '最低準備金を保護');

-- 利息を含む全額を引き出しても元本・平均残高を負にせず、翌月処理を停止させない。
update public.savings_accounts set balance=0, monthly_amount=0 where user_id='e1620000-0000-4000-8000-000000000012';
update public.users set balance=balance+1003 where id='e1620000-0000-4000-8000-000000000012';
select private.record_savings_movement('e1620000-0000-4000-8000-000000000001','e1620000-0000-4000-8000-000000000012',1003,
  'savings_withdraw','savings:test:withdraw-all','2040-05-31T15:00Z');
select pg_temp.savings_assert(private.savings_principal('e1620000-0000-4000-8000-000000000012','2040-06-30T15:00Z')=0, '全額引き出し後の元本は0');
select pg_temp.savings_assert(private.savings_average('e1620000-0000-4000-8000-000000000012','2040-06-01','2040-06-30T15:00Z')=0, '全額引き出し後の平均残高は0');
select private.process_savings_family('e1620000-0000-4000-8000-000000000001','2040-06-30T15:00Z');
select pg_temp.savings_assert((select requested_amount=0 and status='rounded_zero' from public.savings_monthly_runs where user_id='e1620000-0000-4000-8000-000000000012' and kind='interest' and target_month='2040-06-01'), '全額引き出し後も翌月利息を処理できる');

-- 概要取得は設定行を作らず、読み取りだけで完結する。
select set_config('request.jwt.claim.sub','e1620000-0000-4000-8000-000000000031',true);
select pg_temp.savings_assert((public.get_savings_summary()->>'transfer_day')::integer=1, '未設定の積立日は既定値を返す');
select pg_temp.savings_assert(not exists(select 1 from public.savings_settings where family_id='e1620000-0000-4000-8000-000000000003'), '概要取得は設定を作成しない');

-- 時刻を固定した上の口座は公開RPCの検証から独立させる。
-- 新たな家庭Bの子を現在時刻で設定する。
insert into public.users(id,family_id,name,role,balance) values
 ('e1620000-0000-4000-8000-000000000022','e1620000-0000-4000-8000-000000000002','子B','child',200);
update public.guild_treasuries set total_supply=1200 where family_id='e1620000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','e1620000-0000-4000-8000-000000000021',true);
select public.set_savings_day(extract(day from now() at time zone 'Asia/Tokyo')::integer);
select set_config('request.jwt.claim.sub','e1620000-0000-4000-8000-000000000022',true);
select public.set_savings_amount(100);
select public.withdraw_savings(60,'retry-key');
select public.withdraw_savings(60,'retry-key');
select pg_temp.savings_assert((select balance=40 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000022'), '引き出しは一度だけ');
select pg_temp.savings_assert((select balance=160 from public.users where id='e1620000-0000-4000-8000-000000000022'), '引き出し手数料なし');
select public.set_savings_amount(0);
select pg_temp.savings_assert((select monthly_amount=0 and balance=40 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000022'), '停止しても残高を維持');
select pg_temp.savings_assert(jsonb_array_length(public.get_savings_summary()->'accounts')=1, '子は自分だけ取得');
select set_config('request.jwt.claim.sub','e1620000-0000-4000-8000-000000000021',true);
select pg_temp.savings_assert(jsonb_array_length(public.get_savings_summary()->'accounts')=1, '親は自分の家族だけ取得');
do $$
begin
  begin
    perform public.withdraw_savings(1,'parent');
    raise exception '親の引き出しを許可しました';
  exception when raise_exception then
    if sqlerrm <> '自分の積立預金だけ引き出せます' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','e1620000-0000-4000-8000-000000000022',true);
  begin
    perform public.set_savings_day(10);
    raise exception '子の積立日変更を許可しました';
  exception when raise_exception then
    if sqlerrm <> '家庭に所属する親だけが積立日を設定できます' then raise; end if;
  end;
  begin
    perform public.withdraw_savings(61,'retry-key');
    raise exception '同じキーの異なる額を許可しました';
  exception when raise_exception then
    if sqlerrm <> '操作キーが別の引き出しに使用されています' then raise; end if;
  end;
  begin
    perform public.withdraw_savings(41,'insufficient');
    raise exception '残高超過を許可しました';
  exception when raise_exception then
    if sqlerrm <> '積立預金が不足しています' then raise; end if;
  end;
end;
$$;
select pg_temp.savings_assert((select balance=40 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000022'), '失敗時は残高を変えない');

-- 台帳への記帳に失敗した場合、先行した残高更新もロールバックする。
create function pg_temp.reject_savings_ledger() returns trigger language plpgsql as $$
begin
  if new.idempotency_key like '%:atomic-failure' then raise exception '記帳失敗テスト'; end if;
  return new;
end;
$$;
create trigger savings_atomic_failure before insert on public.economy_transactions
for each row execute function pg_temp.reject_savings_ledger();
do $$
begin
  begin
    perform public.withdraw_savings(10,'atomic-failure');
    raise exception '記帳失敗を検出しませんでした';
  exception when raise_exception then
    if sqlerrm <> '記帳失敗テスト' then raise; end if;
  end;
end;
$$;
select pg_temp.savings_assert((select balance=40 from public.savings_accounts where user_id='e1620000-0000-4000-8000-000000000022'), '記帳失敗時の預金ロールバック');
select pg_temp.savings_assert((select balance=160 from public.users where id='e1620000-0000-4000-8000-000000000022'), '記帳失敗時のお財布ロールバック');
select pg_temp.savings_assert((select balance + (select sum(balance) from public.users where family_id=t.family_id)
  + (select sum(balance) from public.savings_accounts where family_id=t.family_id) = total_supply
  from public.guild_treasuries t where family_id='e1620000-0000-4000-8000-000000000002'), '家庭総ゴルを保存');

set local role authenticated;
select pg_temp.savings_assert(jsonb_array_length(public.get_savings_summary()->'accounts')=1, '認証ロールから自分の口座を取得');
reset role;
rollback;
