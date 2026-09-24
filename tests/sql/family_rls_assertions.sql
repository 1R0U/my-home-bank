-- Issue #208: 2家庭のデータがRLSとRPCの両方で分離されることを確認する。
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  %（拒否された: %）', p_label, replace(sqlerrm, E'\n', ' ');
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

select pg_temp.assert(
  (select count(*) from public.users
   where id in (
     '00000000-0000-4000-8000-000000000001',
     '00000000-0000-4000-8000-000000000002'
   ) and family_id = '00000000-0000-4000-8000-000000000208') = 2,
  '既存利用者のfamily_idが補完される'
);

select pg_temp.assert(
  exists (
    select 1 from public.guild_treasuries
    where family_id = '00000000-0000-4000-8000-000000000208'
      and initial_supply = 10000
  ),
  '補完した既存家庭にもギルド金庫が作られる'
);

insert into public.families (id, name) values
  ('20800000-0000-4000-8000-000000000001', '208家庭A'),
  ('20800000-0000-4000-8000-000000000002', '208家庭B');

insert into public.users (id, family_id, name, role, balance) values
  ('20800000-0000-4000-8000-000000000011', '20800000-0000-4000-8000-000000000001', '家庭Aの親', 'parent', 100),
  ('20800000-0000-4000-8000-000000000012', '20800000-0000-4000-8000-000000000001', '家庭Aの子', 'child', 100),
  ('20800000-0000-4000-8000-000000000013', '20800000-0000-4000-8000-000000000001', '家庭Aの別の子', 'child', 100),
  ('20800000-0000-4000-8000-000000000021', '20800000-0000-4000-8000-000000000002', '家庭Bの親', 'parent', 100),
  ('20800000-0000-4000-8000-000000000022', '20800000-0000-4000-8000-000000000002', '家庭Bの子', 'child', 100);

insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('20800000-0000-4000-8000-000000000101', '20800000-0000-4000-8000-000000000001', '家庭Aクエスト', '', 10, 'open', '20800000-0000-4000-8000-000000000011', 'daily', null),
  ('20800000-0000-4000-8000-000000000102', '20800000-0000-4000-8000-000000000002', '家庭Bクエスト', '', 10, 'open', '20800000-0000-4000-8000-000000000021', 'daily', null),
  ('20800000-0000-4000-8000-000000000103', '20800000-0000-4000-8000-000000000001', '家庭A完了済み', '', 10, 'completed', '20800000-0000-4000-8000-000000000011', 'daily', '20800000-0000-4000-8000-000000000012'),
  ('20800000-0000-4000-8000-000000000104', '20800000-0000-4000-8000-000000000001', '家庭A受注済み', '', 10, 'accepted', '20800000-0000-4000-8000-000000000011', 'daily', '20800000-0000-4000-8000-000000000013'),
  ('20800000-0000-4000-8000-000000000105', '20800000-0000-4000-8000-000000000001', '家庭A未受注', '', 10, 'open', '20800000-0000-4000-8000-000000000011', 'daily', null);

insert into public.quest_logs (id, quest_id, user_id) values
  ('20800000-0000-4000-8000-000000000111', '20800000-0000-4000-8000-000000000101', '20800000-0000-4000-8000-000000000012');

select pg_temp.assert(
  (select family_id = '20800000-0000-4000-8000-000000000001'
   from public.quest_logs where id = '20800000-0000-4000-8000-000000000111'),
  'quest_logs.family_idはクエストから自動設定される'
);

insert into public.store_item_requests
  (id, family_id, requested_by, title, description, reason, image_url) values
  ('20800000-0000-4000-8000-000000000121', '20800000-0000-4000-8000-000000000001', '20800000-0000-4000-8000-000000000012', '家庭A申請', '', '', 'a'),
  ('20800000-0000-4000-8000-000000000122', '20800000-0000-4000-8000-000000000002', '20800000-0000-4000-8000-000000000022', '家庭B申請', '', '', 'b');

insert into public.task_reports
  (id, family_id, reported_by, title, description) values
  ('20800000-0000-4000-8000-000000000131', '20800000-0000-4000-8000-000000000001', '20800000-0000-4000-8000-000000000012', '家庭A報告', ''),
  ('20800000-0000-4000-8000-000000000132', '20800000-0000-4000-8000-000000000002', '20800000-0000-4000-8000-000000000022', '家庭B報告', '');

insert into public.store_items
  (id, family_id, title, description, price, stock, requested_by) values
  ('20800000-0000-4000-8000-000000000141', '20800000-0000-4000-8000-000000000001', '家庭A商品', '', 10, 5, '20800000-0000-4000-8000-000000000011'),
  ('20800000-0000-4000-8000-000000000142', '20800000-0000-4000-8000-000000000002', '家庭B商品', '', 10, 5, '20800000-0000-4000-8000-000000000021');

insert into public.transactions (user_id, type, description, amount) values
  ('20800000-0000-4000-8000-000000000012', 'bank_interest', '家庭A取引', 1),
  ('20800000-0000-4000-8000-000000000022', 'bank_interest', '家庭B取引', 1);

insert into public.placed_decorations (user_id, asset_id, position_x, position_z) values
  ('20800000-0000-4000-8000-000000000012', 'decoration-a', 0, 0),
  ('20800000-0000-4000-8000-000000000022', 'decoration-b', 1, 1);
insert into public.owned_items (user_id, asset_id) values
  ('20800000-0000-4000-8000-000000000012', 'wearable-a'),
  ('20800000-0000-4000-8000-000000000022', 'wearable-b');
insert into public.equipped_items (user_id, slot, asset_id) values
  ('20800000-0000-4000-8000-000000000012', 'head', 'wearable-a'),
  ('20800000-0000-4000-8000-000000000022', 'head', 'wearable-b');

set role authenticated;
select set_config('request.jwt.claim.sub', '20800000-0000-4000-8000-000000000012', false);

select pg_temp.assert((select count(*) from public.quests) = 4, '別家庭のquestsが見えない');
select pg_temp.assert((select count(*) from public.quest_logs) = 1, '別家庭のquest_logsが見えない');
select pg_temp.assert((select count(*) from public.store_item_requests) = 1, '別家庭の商品申請が見えない');
select pg_temp.assert((select count(*) from public.task_reports) = 1, '別家庭の自主報告が見えない');
select pg_temp.assert((select count(*) from public.store_items) = 1, '別家庭の商品が見えない');
select pg_temp.assert((select count(*) from public.transactions) = 1, '別利用者の画面用取引が見えない');
select pg_temp.assert((select count(*) from public.bank_accounts) = 1, '別利用者の銀行口座が見えない');
select pg_temp.assert((select count(*) from public.placed_decorations) = 1, '別利用者の装飾が見えない');
select pg_temp.assert((select count(*) from public.owned_items) = 1, '別利用者の所有品が見えない');
select pg_temp.assert((select count(*) from public.equipped_items) = 1, '別利用者の装備が見えない');

update public.quests
set status = 'accepted', assigned_to = '20800000-0000-4000-8000-000000000012'
where id = '20800000-0000-4000-8000-000000000103';
select pg_temp.assert(
  (select status = 'completed'
   from public.quests where id = '20800000-0000-4000-8000-000000000103'),
  '子供は完了済みクエストを受注中へ戻せない'
);

update public.quests
set assigned_to = '20800000-0000-4000-8000-000000000012'
where id = '20800000-0000-4000-8000-000000000104';
select pg_temp.assert(
  (select assigned_to = '20800000-0000-4000-8000-000000000013'
   from public.quests where id = '20800000-0000-4000-8000-000000000104'),
  '子供は別の子が受注中のクエストを横取りできない'
);

update public.quests
set status = 'accepted', assigned_to = '20800000-0000-4000-8000-000000000012'
where id = '20800000-0000-4000-8000-000000000105';
select pg_temp.assert(
  (select status = 'accepted'
          and assigned_to = '20800000-0000-4000-8000-000000000012'
   from public.quests where id = '20800000-0000-4000-8000-000000000105'),
  '子供は未受注クエストを本人として受注できる'
);
select public.submit_quest_completion(
  '20800000-0000-4000-8000-000000000105',
  '20800000-0000-4000-8000-000000000012'
);
select pg_temp.assert(
  exists (
    select 1 from public.quest_logs
    where quest_id = '20800000-0000-4000-8000-000000000105'
      and user_id = '20800000-0000-4000-8000-000000000012'
      and status = 'pending'
  ),
  '正規の受注後は完了報告できる'
);

select pg_temp.assert_rejected(
  $q$insert into public.task_reports (family_id, reported_by, title, description)
     values ('20800000-0000-4000-8000-000000000002',
             '20800000-0000-4000-8000-000000000012', '越境報告', '')$q$,
  '別家庭を指定した直接insert'
);

select pg_temp.assert_rejected(
  $q$insert into public.store_item_requests
       (family_id, requested_by, title, description, reason, image_url, status)
     values ('20800000-0000-4000-8000-000000000001',
             '20800000-0000-4000-8000-000000000012', '不正承認申請', '', '', 'a', 'approved')$q$,
  '子供が承認済みの商品申請を直接insertできない'
);

select pg_temp.assert_rejected(
  $q$insert into public.task_reports
       (family_id, reported_by, title, description, status)
     values ('20800000-0000-4000-8000-000000000001',
             '20800000-0000-4000-8000-000000000012', '不正承認報告', '', 'approved')$q$,
  '子供が承認済みの自主報告を直接insertできない'
);

select pg_temp.assert_rejected(
  $q$select public.purchase_store_item(
       '20800000-0000-4000-8000-000000000012',
       '20800000-0000-4000-8000-000000000142',
       'family-rls-cross-family')$q$,
  '購入RPCによる別家庭商品の操作'
);

select pg_temp.assert_rejected(
  $q$select public.bank_deposit(
       '20800000-0000-4000-8000-000000000022', 1)$q$,
  '銀行RPCによる別利用者口座の操作'
);

reset role;
reset request.jwt.claim.sub;

\o
\echo === Issue #208 家庭分離を確認しました ===
