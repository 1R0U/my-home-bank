-- Issue #166: クエスト報酬・ストア購入がギルド金庫との移動になることを実DBで検証する。
\set ON_ERROR_STOP on

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'アサーション失敗（拒否されるはずが成功）: %', p_label;
end;
$$;

select pg_temp.assert(
  not has_function_privilege('anon', 'public.approve_quest_log(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.approve_quest_log(uuid,uuid)', 'EXECUTE'),
  'クエスト承認RPCは認証済み利用者だけが実行できる'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.purchase_store_item(uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.purchase_store_item(uuid,uuid,text)', 'EXECUTE'),
  'ストア購入RPCは認証済み利用者だけが実行できる'
);

insert into public.families (id, name) values
  ('a0000000-0000-4000-8000-000000000001', '支払い検証家族A'),
  ('b0000000-0000-4000-8000-000000000001', '支払い検証家族B');

insert into public.users (id, family_id, name, role, balance) values
  ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', '親A', 'parent', 0),
  ('a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', '子A', 'child', 200),
  ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', '親B', 'parent', 0),
  ('b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', '子B', 'child', 100);

insert into public.guild_treasuries (
  family_id, balance, initial_supply, total_supply, minimum_reserve_rate
) values
  ('a0000000-0000-4000-8000-000000000001', 1000, 1000, 1200, 0.2000),
  ('b0000000-0000-4000-8000-000000000001', 500, 500, 600, 0.2000);

-- クエスト報酬は金庫を減らし、子どものWalletを同額増やす。
insert into public.quests (
  id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'a0000000-0000-4000-8000-000000000021', '報酬検証', '', 50, 'pending',
  'a0000000-0000-4000-8000-000000000011', 'daily',
  'a0000000-0000-4000-8000-000000000012'
);

insert into public.quest_logs (id, quest_id, user_id, status)
values (
  'a0000000-0000-4000-8000-000000000022',
  'a0000000-0000-4000-8000-000000000021',
  'a0000000-0000-4000-8000-000000000012',
  'pending'
);

select set_config(
  'request.jwt.claim.sub',
  'b0000000-0000-4000-8000-000000000011',
  true
);
select pg_temp.assert_rejected(
  $$select public.approve_quest_log(
      'a0000000-0000-4000-8000-000000000022',
      'a0000000-0000-4000-8000-000000000011'
    )$$,
  'ログイン中の利用者と異なる親としてのクエスト承認'
);

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000011',
  true
);

select public.approve_quest_log(
  'a0000000-0000-4000-8000-000000000022',
  'a0000000-0000-4000-8000-000000000011'
);

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_economy_count integer;
  v_legacy_count integer;
begin
  select balance into v_wallet
  from public.users where id = 'a0000000-0000-4000-8000-000000000012';
  select balance into v_treasury
  from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001';
  select count(*) into v_economy_count
  from public.economy_transactions
  where related_id = 'a0000000-0000-4000-8000-000000000022'
    and type = 'quest_reward'
    and from_account_type = 'treasury'
    and to_account_type = 'wallet'
    and amount = 50;
  select count(*) into v_legacy_count
  from public.transactions
  where quest_log_id = 'a0000000-0000-4000-8000-000000000022'
    and type = 'quest_reward'
    and amount = 50;

  perform pg_temp.assert(v_wallet = 250, '報酬でWalletが200から250になる');
  perform pg_temp.assert(v_treasury = 950, '報酬で金庫が1000から950になる');
  perform pg_temp.assert(v_wallet + v_treasury = 1200, '報酬前後で合計HMCが変わらない');
  perform pg_temp.assert(v_economy_count = 1, '報酬が経済台帳へ1件記録される');
  perform pg_temp.assert(v_legacy_count = 1, '報酬が画面用台帳へ1件記録される');
end;
$$;

-- 他家族の親によるクエスト承認を拒否し、状態と残高を変えない。
insert into public.quests (
  id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'b0000000-0000-4000-8000-000000000021', '他家族承認検証', '', 10, 'pending',
  'b0000000-0000-4000-8000-000000000011', 'daily',
  'b0000000-0000-4000-8000-000000000012'
);
insert into public.quest_logs (id, quest_id, user_id, status)
values (
  'b0000000-0000-4000-8000-000000000022',
  'b0000000-0000-4000-8000-000000000021',
  'b0000000-0000-4000-8000-000000000012',
  'pending'
);

select pg_temp.assert_rejected(
  $$select public.approve_quest_log(
      'b0000000-0000-4000-8000-000000000022',
      'a0000000-0000-4000-8000-000000000011'
    )$$,
  '他家族のクエスト承認'
);

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_status text;
begin
  select balance into v_wallet
  from public.users where id = 'b0000000-0000-4000-8000-000000000012';
  select balance into v_treasury
  from public.guild_treasuries where family_id = 'b0000000-0000-4000-8000-000000000001';
  select status into v_status
  from public.quest_logs where id = 'b0000000-0000-4000-8000-000000000022';
  perform pg_temp.assert(v_wallet = 100 and v_treasury = 500, '他家族承認の拒否後に残高が変わらない');
  perform pg_temp.assert(v_status = 'pending', '他家族承認の拒否後も完了報告が承認待ちのまま');
end;
$$;

-- 最低準備金を割り込む報酬は、申請状態も残高も変更せず拒否する。
update public.guild_treasuries
set balance = 240
where family_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.quests (
  id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'a0000000-0000-4000-8000-000000000023', '準備金検証', '', 1, 'pending',
  'a0000000-0000-4000-8000-000000000011', 'daily',
  'a0000000-0000-4000-8000-000000000012'
);
insert into public.quest_logs (id, quest_id, user_id, status)
values (
  'a0000000-0000-4000-8000-000000000024',
  'a0000000-0000-4000-8000-000000000023',
  'a0000000-0000-4000-8000-000000000012',
  'pending'
);

select pg_temp.assert_rejected(
  $$select public.approve_quest_log(
      'a0000000-0000-4000-8000-000000000024',
      'a0000000-0000-4000-8000-000000000011'
    )$$,
  '最低準備金を割り込む報酬'
);

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_status text;
begin
  select balance into v_wallet
  from public.users where id = 'a0000000-0000-4000-8000-000000000012';
  select balance into v_treasury
  from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001';
  select status into v_status
  from public.quest_logs where id = 'a0000000-0000-4000-8000-000000000024';
  perform pg_temp.assert(v_wallet = 250 and v_treasury = 240, '拒否後に残高が変わらない');
  perform pg_temp.assert(v_status = 'pending', '拒否後も完了報告が承認待ちのまま');
end;
$$;

-- ストア購入はDB価格をWalletから金庫へ移し、在庫を1つ減らす。
update public.guild_treasuries
set balance = 950
where family_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.store_items (
  id, family_id, title, description, image_url, price, stock, requested_by
) values (
  'a0000000-0000-4000-8000-000000000031',
  'a0000000-0000-4000-8000-000000000001',
  '購入検証商品', '', '', 80, 2,
  'a0000000-0000-4000-8000-000000000012'
);

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000011',
  true
);
select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
      'a0000000-0000-4000-8000-000000000012',
      'a0000000-0000-4000-8000-000000000031',
      'test-mismatched-purchaser'
    )$$,
  'ログイン中の利用者と異なる子どもとしてのストア購入'
);

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000012',
  true
);

select public.purchase_store_item(
  'a0000000-0000-4000-8000-000000000012',
  'a0000000-0000-4000-8000-000000000031',
  'test-store-purchase-1'
);

-- 購入後に商品が無効化されても、同じ操作の再送は既存取引を返す。
update public.store_items
set is_active = false
where id = 'a0000000-0000-4000-8000-000000000031';

select public.purchase_store_item(
  'a0000000-0000-4000-8000-000000000012',
  'a0000000-0000-4000-8000-000000000031',
  'test-store-purchase-1'
);

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_stock bigint;
  v_economy_count integer;
  v_legacy_count integer;
begin
  select balance into v_wallet
  from public.users where id = 'a0000000-0000-4000-8000-000000000012';
  select balance into v_treasury
  from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001';
  select stock into v_stock
  from public.store_items where id = 'a0000000-0000-4000-8000-000000000031';
  select count(*) into v_economy_count
  from public.economy_transactions where idempotency_key = 'test-store-purchase-1';
  select count(*) into v_legacy_count
  from public.transactions
  where user_id = 'a0000000-0000-4000-8000-000000000012'
    and type = 'store_purchase'
    and amount = -80;

  perform pg_temp.assert(v_wallet = 170, '購入でWalletが250から170になる');
  perform pg_temp.assert(v_treasury = 1030, '購入で金庫が950から1030になる');
  perform pg_temp.assert(v_wallet + v_treasury = 1200, '購入前後で合計HMCが変わらない');
  perform pg_temp.assert(v_stock = 1, '再送しても在庫は1つだけ減る');
  perform pg_temp.assert(v_economy_count = 1, '再送しても経済台帳は1件だけ');
  perform pg_temp.assert(v_legacy_count = 1, '再送しても画面用台帳は1件だけ');
end;
$$;

-- Wallet残高不足と他家族の商品を拒否する。
insert into public.store_items (
  id, family_id, title, description, image_url, price, stock, requested_by
) values
  (
    'a0000000-0000-4000-8000-000000000032',
    'a0000000-0000-4000-8000-000000000001',
    '高額商品', '', '', 500, 1,
    'a0000000-0000-4000-8000-000000000012'
  ),
  (
    'b0000000-0000-4000-8000-000000000032',
    'b0000000-0000-4000-8000-000000000001',
    '他家族の商品', '', '', 10, 1,
    'b0000000-0000-4000-8000-000000000012'
  );

select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
      'a0000000-0000-4000-8000-000000000012',
      'a0000000-0000-4000-8000-000000000032',
      'test-insufficient-wallet'
    )$$,
  'Wallet残高不足の購入'
);

select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
      'a0000000-0000-4000-8000-000000000012',
      'b0000000-0000-4000-8000-000000000032',
      'test-cross-family-store'
    )$$,
  '他家族の商品購入'
);

do $$
declare
  v_wallet numeric;
  v_treasury bigint;
  v_expensive_stock bigint;
  v_other_family_stock bigint;
begin
  select balance into v_wallet
  from public.users where id = 'a0000000-0000-4000-8000-000000000012';
  select balance into v_treasury
  from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001';
  select stock into v_expensive_stock
  from public.store_items where id = 'a0000000-0000-4000-8000-000000000032';
  select stock into v_other_family_stock
  from public.store_items where id = 'b0000000-0000-4000-8000-000000000032';

  perform pg_temp.assert(v_wallet = 170 and v_treasury = 1030, '購入拒否後に残高が変わらない');
  perform pg_temp.assert(v_expensive_stock = 1, '残高不足の購入拒否後に在庫が変わらない');
  perform pg_temp.assert(v_other_family_stock = 1, '他家族購入の拒否後に在庫が変わらない');
end;
$$;

rollback;
