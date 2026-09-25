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

create function pg_temp.assert_rejected(p_sql text, p_expected text, p_label text)
returns void
language plpgsql
as $$
declare
  v_message text;
  v_sqlstate text;
begin
  begin
    execute p_sql;
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
  not has_function_privilege('anon', 'public.approve_quest_log(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.approve_quest_log(uuid,uuid)', 'EXECUTE'),
  'クエスト承認RPCは認証済み利用者だけが実行できる'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.purchase_store_item(uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.purchase_store_item(uuid,uuid,text)', 'EXECUTE'),
  'ストア購入RPCは認証済み利用者だけが実行できる'
);

select pg_temp.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quests'::regclass
      and conname = 'quests_reward_amount_safe_positive'
      and convalidated
  ),
  'クエスト報酬額の制約が有効になっている'
);

do $$
declare
  v_amount numeric;
begin
  foreach v_amount in array array[0::numeric, -1, 50.5, 9007199254740992] loop
    begin
      insert into public.quests (id, family_id, title, reward_amount, status, category)
      values (
        'e0000000-0000-4000-8000-000000000021',
        '00000000-0000-4000-8000-000000000208',
        '報酬額制約検証',
        v_amount,
        'open',
        'daily'
      );
      raise exception '不正な報酬額 % を保存できました', v_amount;
    exception when check_violation then
      null;
    end;
  end loop;
end;
$$;

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
  id, family_id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'a0000000-0000-4000-8000-000000000021',
  'a0000000-0000-4000-8000-000000000001', '報酬検証', '', 50, 'pending',
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
  '承認者がログイン利用者と一致しません',
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
  id, family_id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'b0000000-0000-4000-8000-000000000021',
  'b0000000-0000-4000-8000-000000000001', '他家族承認検証', '', 10, 'pending',
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
  '別の家庭の完了報告は操作できません',
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
  id, family_id, title, description, reward_amount, status, created_by, category, assigned_to
) values (
  'a0000000-0000-4000-8000-000000000023',
  'a0000000-0000-4000-8000-000000000001', '準備金検証', '', 1, 'pending',
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
  'ギルド金庫の最低準備金を下回るため送金できません',
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
  'ログイン中の利用者本人だけがストア商品を購入できます',
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

set local role authenticated;
select pg_temp.assert(
  not exists (
    select 1 from public.store_items
    where id = 'a0000000-0000-4000-8000-000000000031'
  ),
  '無効な商品は認証済み利用者の商品一覧に表示しない'
);
reset role;

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
  'Wallet残高が不足しています',
  'Wallet残高不足の購入'
);

select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
      'a0000000-0000-4000-8000-000000000012',
      'b0000000-0000-4000-8000-000000000032',
      'test-cross-family-store'
    )$$,
  '他の家庭の商品は購入できません',
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

-- 本人確認を通過した親が、購入者ロールの検証で拒否されることを確認する。
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
    'a0000000-0000-4000-8000-000000000011',
    'a0000000-0000-4000-8000-000000000032', 'test-parent-purchase'
  )$$,
  'ストア商品を購入できるのは子どもだけです',
  '親による購入'
);
select pg_temp.assert(
  (select balance = 0 from public.users where id = 'a0000000-0000-4000-8000-000000000011')
  and (select balance = 1030 from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001')
  and (select stock = 1 from public.store_items where id = 'a0000000-0000-4000-8000-000000000032')
  and not exists (select 1 from public.economy_transactions where idempotency_key = 'test-parent-purchase')
  and not exists (select 1 from public.transactions where user_id = 'a0000000-0000-4000-8000-000000000011'),
  '親の購入拒否では残高・在庫・両台帳を変更しない'
);

-- 有効な商品を売り切れにしてから、別キーによる新規購入だけを拒否する。
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000012', true);
update public.store_items set is_active = true
where id = 'a0000000-0000-4000-8000-000000000031';
select public.purchase_store_item(
  'a0000000-0000-4000-8000-000000000012',
  'a0000000-0000-4000-8000-000000000031', 'test-last-stock'
);
select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000031', 'test-out-of-stock'
  )$$,
  '商品は在庫切れです',
  '在庫切れの商品を別キーで購入'
);
select pg_temp.assert(
  (select balance = 90 from public.users where id = 'a0000000-0000-4000-8000-000000000012')
  and (select balance = 1110 from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001')
  and (select stock = 0 from public.store_items where id = 'a0000000-0000-4000-8000-000000000031')
  and (select count(*) = 2 from public.economy_transactions where type = 'store_purchase' and actor_user_id = 'a0000000-0000-4000-8000-000000000012')
  and (select count(*) = 2 from public.transactions where type = 'store_purchase' and user_id = 'a0000000-0000-4000-8000-000000000012'),
  '在庫切れ拒否では残高・在庫・両台帳を変更しない'
);

-- 売り切れ後に商品そのものを削除しても、完了済み購入の再送は成功する。
delete from public.store_items
where id = 'a0000000-0000-4000-8000-000000000031';
select pg_temp.assert(
  public.purchase_store_item(
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000031', ' test-last-stock '
  ) = (select id from public.economy_transactions where idempotency_key = 'test-last-stock'),
  '削除済み商品の再送は空白を除去したキーで同じ取引IDを返す'
);
select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000032', 'test-last-stock'
  )$$,
  '同じidempotency_keyが別のストア購入に使用されています',
  '別の商品への冪等キー流用'
);

-- 実行権限とは別に、購入関数本体でも未認証利用者を拒否する。
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_rejected(
  $$select public.purchase_store_item(
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000031', 'test-last-stock'
  )$$,
  'ログイン中の利用者本人だけがストア商品を購入できます',
  '未認証の購入済み取引の再送'
);
select pg_temp.assert(
  (select balance = 90 from public.users where id = 'a0000000-0000-4000-8000-000000000012')
  and (select balance = 1110 from public.guild_treasuries where family_id = 'a0000000-0000-4000-8000-000000000001')
  and (select stock = 1 from public.store_items where id = 'a0000000-0000-4000-8000-000000000032')
  and (select status = 'pending' from public.quest_logs where id = 'a0000000-0000-4000-8000-000000000024')
  and (select count(*) = 3 from public.economy_transactions where family_id = 'a0000000-0000-4000-8000-000000000001')
  and (select count(*) = 3 from public.transactions where user_id = 'a0000000-0000-4000-8000-000000000012'),
  '削除後再送・キー流用・未認証拒否で残高・在庫・申請・両台帳は変化しない'
);

-- Issue #64の無制限在庫を金庫決済版でも維持する。
select pg_temp.assert(
  public.store_unlimited_stock() = 999999,
  'DBとTypeScriptの無制限在庫値が一致する'
);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000012', true);
insert into public.store_items (
  id, family_id, title, description, price, stock, requested_by
) values (
  'a0000000-0000-4000-8000-000000000033',
  'a0000000-0000-4000-8000-000000000001',
  '無制限在庫商品', '', 10, 999999,
  'a0000000-0000-4000-8000-000000000011'
);
select public.purchase_store_item(
  'a0000000-0000-4000-8000-000000000012',
  'a0000000-0000-4000-8000-000000000033',
  'test-unlimited-stock'
);
select pg_temp.assert(
  (select stock = 999999 from public.store_items
   where id = 'a0000000-0000-4000-8000-000000000033')
  and (select balance = 80 from public.users
       where id = 'a0000000-0000-4000-8000-000000000012')
  and (select balance = 1120 from public.guild_treasuries
       where family_id = 'a0000000-0000-4000-8000-000000000001'),
  '無制限在庫は減らさず、Walletから金庫へ支払う'
);

rollback;
