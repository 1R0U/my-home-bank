-- PR #499 / #510: 確認済みの同名・完了済みタスクだけを指定どおり繰り返す。
\set ON_ERROR_STOP on
\o /dev/null
begin;
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;
create or replace function pg_temp.reject(p_sql text, p_expected text)
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then raise exception '想定と違う拒否: %', sqlerrm; end if;
    return;
  end;
  raise exception '拒否されるはずが成功: %', p_sql;
end; $$;
-- 実際の補完SQLを呼び、検査の失敗時に更新が残らないことも確認する。
-- CIからpsql変数として渡す。引用符付きの変数展開でSQL全体を文字列として保存する。
create temp table quest_period_backfill_sql (statement text not null);
insert into quest_period_backfill_sql values (:'quest_period_backfill_sql');
create function pg_temp.apply_quest_period_backfill()
returns void language plpgsql as $$
begin
  execute (select statement from pg_temp.quest_period_backfill_sql);
end;
$$;

-- 家庭IDは以前の移行SQLの固定値と異なるものを使い、今回の不具合を再現する。
insert into public.families (id, name) values
  ('26300000-0000-4000-8000-000000000001', '移行対象の家庭'),
  ('26300000-0000-4000-8000-000000000002', '既に移行済みの別家庭'),
  ('26300000-0000-4000-8000-000000000003', '完了済みを引き継ぐ家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('26300000-0000-4000-8000-000000000011', '26300000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('061d2a98-5e70-4c73-9885-c9808d7c92b0', '26300000-0000-4000-8000-000000000001', '子A', 'child', 0),
  ('00000000-0000-4000-8000-000000000000', '26300000-0000-4000-8000-000000000001', '子B', 'child', 0),
  ('26300000-0000-4000-8000-000000000021', '26300000-0000-4000-8000-000000000002', '別家庭の親', 'parent', 0),
  ('26300000-0000-4000-8000-000000000031', '26300000-0000-4000-8000-000000000003', '完了済みの親', 'parent', 0),
  ('26300000-0000-4000-8000-000000000032', '26300000-0000-4000-8000-000000000003', '完了済みの子', 'child', 280);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply)
values ('26300000-0000-4000-8000-000000000003', 720, 1000, 1000);
-- CIの先行テストと同様に、移行済みの完了済みタスクも同じDBに残っている状況を再現する。
insert into public.quests (id, family_id, title, reward_amount, category, status, created_by) values
  ('26300000-0000-4000-8000-000000000201', '26300000-0000-4000-8000-000000000002', '別家庭の完了済み', 10, 'daily', 'completed', '26300000-0000-4000-8000-000000000021');
insert into public.quests (id, family_id, title, reward_amount, category, status, assigned_to, created_by) values
  ('427714d8-a0d3-4c82-af5d-92220c2611fc', '26300000-0000-4000-8000-000000000001', 'あ', 10, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011'),
  ('de98a7ce-ae93-4be6-aea8-4edc14f79d55', '26300000-0000-4000-8000-000000000001', 'あ', 10, 'daily', 'accepted', '061d2a98-5e70-4c73-9885-c9808d7c92b0', '26300000-0000-4000-8000-000000000011'),
  ('b1731de0-5259-46aa-9734-31240983cd63', '26300000-0000-4000-8000-000000000001', 'あ', 100, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011'),
  ('f95ddcd8-4a90-4348-8a6c-b6e849785ab9', '26300000-0000-4000-8000-000000000001', 'い', 100, 'daily', 'accepted', '00000000-0000-4000-8000-000000000000', '26300000-0000-4000-8000-000000000011'),
  ('0f0eedf5-ab85-4d0f-9b5e-d94a4b4a5a98', '26300000-0000-4000-8000-000000000001', 'か', 50, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null, daily_end_minutes = null
  where family_id = '26300000-0000-4000-8000-000000000001';
create temp table original_quests as select * from public.quests where family_id = '26300000-0000-4000-8000-000000000001';

-- 追加で確認した完了済み6件。過去の支払い済み記録は初回移行でも変更しない。
insert into public.quests (id, family_id, title, reward_amount, category, status, assigned_to, created_by)
select id, '26300000-0000-4000-8000-000000000003'::uuid, title, reward_amount, 'daily', 'completed',
  '26300000-0000-4000-8000-000000000032'::uuid, '26300000-0000-4000-8000-000000000031'::uuid
from (values
  ('a59f40bf-90e2-4afc-89a2-068d756fc998'::uuid, 'あ', 10),
  ('ea9a1523-bd3c-4dfd-bfef-81bb5e095cc9'::uuid, 'い', 10),
  ('012a4c92-1bf0-4672-82c1-c45ef5d6acb3'::uuid, 'う', 10),
  ('f8f409e5-4794-4b5a-a941-bb2500123aef'::uuid, 'お風呂掃除', 100),
  ('31a440bb-a066-4c39-9b1e-245f97f45d25'::uuid, '宿題', 50),
  ('56d11b9d-9e3a-4de8-ac40-0f3a702dabe9'::uuid, '部屋の掃除', 100)
) fixture(id, title, reward_amount);
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null, daily_end_minutes = null
  where family_id = '26300000-0000-4000-8000-000000000003';
insert into public.quest_logs (quest_id, user_id, status, completed_at, approved_by, approved_at)
select id, assigned_to, 'approved', '2026-10-24 10:00Z', created_by, '2026-10-24 11:00Z'
from public.quests where family_id = '26300000-0000-4000-8000-000000000003';
create temp table original_completed_quests as select * from public.quests where family_id = '26300000-0000-4000-8000-000000000003';
create temp table original_completed_logs as select * from public.quest_logs where family_id = '26300000-0000-4000-8000-000000000003';
select pg_temp.reject('select private.check_quest_period_backfill(null)', '除外するクエストIDが不正');
select pg_temp.reject('select private.check_quest_period_backfill(array[null]::uuid[])', '除外するクエストIDが不正');

update public.quests set reward_amount = 101 where id = 'b1731de0-5259-46aa-9734-31240983cd63';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの既存クエストが変更');
select pg_temp.assert(not exists(select 1 from public.quests where recurrence_source_id is not null
  and family_id = '26300000-0000-4000-8000-000000000001'), '確認時と違う内容では補完しない');
update public.quests set reward_amount = 100 where id = 'b1731de0-5259-46aa-9734-31240983cd63';
update public.quests set id = '26300000-0000-4000-8000-000000000099' where id = '427714d8-a0d3-4c82-af5d-92220c2611fc';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの既存クエストが変更');
update public.quests set id = '427714d8-a0d3-4c82-af5d-92220c2611fc' where id = '26300000-0000-4000-8000-000000000099';

-- 家庭IDを決め打ちしなくても、確認した3件が別家庭に分かれていたら停止する。
update public.quests set family_id = '26300000-0000-4000-8000-000000000002',
  created_by = '26300000-0000-4000-8000-000000000021'
  where id = '427714d8-a0d3-4c82-af5d-92220c2611fc';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの既存クエストが変更');
update public.quests set family_id = '26300000-0000-4000-8000-000000000001',
  created_by = '26300000-0000-4000-8000-000000000011'
  where id = '427714d8-a0d3-4c82-af5d-92220c2611fc';

update public.quests set reward_amount = 101 where id = 'f8f409e5-4794-4b5a-a941-bb2500123aef';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの完了済みクエストが変更');
update public.quests set reward_amount = 100 where id = 'f8f409e5-4794-4b5a-a941-bb2500123aef';
savepoint missing_completed_quest;
delete from public.quest_logs where quest_id = '012a4c92-1bf0-4672-82c1-c45ef5d6acb3';
delete from public.quests where id = '012a4c92-1bf0-4672-82c1-c45ef5d6acb3';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの完了済みクエストが変更');
rollback to savepoint missing_completed_quest;
release savepoint missing_completed_quest;
update public.quests set status = 'open' where id = 'f8f409e5-4794-4b5a-a941-bb2500123aef';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの完了済みクエストが変更');
update public.quests set status = 'completed' where id = 'f8f409e5-4794-4b5a-a941-bb2500123aef';
savepoint different_completed_family;
delete from public.quest_logs where quest_id = '012a4c92-1bf0-4672-82c1-c45ef5d6acb3';
update public.quests set family_id = '26300000-0000-4000-8000-000000000002',
  created_by = '26300000-0000-4000-8000-000000000021', assigned_to = null
  where id = '012a4c92-1bf0-4672-82c1-c45ef5d6acb3';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの完了済みクエストが変更');
rollback to savepoint different_completed_family;
release savepoint different_completed_family;

-- 今回の確認を、ほかの未確認の完了済み・同名候補へ広げない。
insert into public.quests (id, family_id, title, reward_amount, category, status, created_by) values
  ('26300000-0000-4000-8000-000000000098', '26300000-0000-4000-8000-000000000001', '別の完了済み', 10, 'daily', 'completed', '26300000-0000-4000-8000-000000000011');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null
  where id = '26300000-0000-4000-8000-000000000098';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（完了済み）');
update public.quests set title = 'あ', status = 'open' where id = '26300000-0000-4000-8000-000000000098';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（同名の行が複数）');
select pg_temp.assert(not exists(select 1 from public.quests where recurrence_source_id is not null
  and family_id = '26300000-0000-4000-8000-000000000001'), '未確認の候補が増えた場合も一部だけ補完しない');
select pg_temp.assert(not exists(select 1 from public.quests where recurrence_source_id is not null
  and family_id = '26300000-0000-4000-8000-000000000003'), '後続の検査で拒否されたら完了済み3件の補完も取り消す');
delete from public.quests where id = '26300000-0000-4000-8000-000000000098';

-- 確認済みの完了済みも、未確認の同名タスクとの重複検査から外さない。
insert into public.quests (id, family_id, title, reward_amount, category, created_by) values
  ('26300000-0000-4000-8000-000000000096', '26300000-0000-4000-8000-000000000003', '宿題', 50, 'daily', '26300000-0000-4000-8000-000000000031');
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（同名の行が複数）');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null
  where id = '26300000-0000-4000-8000-000000000096';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（同名の行が複数）');
delete from public.quests where id = '26300000-0000-4000-8000-000000000096';

select pg_temp.apply_quest_period_backfill();
select pg_temp.assert((select count(*) = 3 from public.quests where recurrence_source_id = id
  and family_id = '26300000-0000-4000-8000-000000000001'), '100 golの「あ」と「い」「か」の3件だけを設定元にする');
select pg_temp.assert((select count(*) = 2 and bool_and(to_jsonb(q) = to_jsonb(original))
  from public.quests q join original_quests original using (id) where q.recurrence_source_id is null), '古い10 golの2件は全列をそのまま保持する');
select pg_temp.assert((select bool_and(q.status = original.status and q.assigned_to is not distinct from original.assigned_to
  and q.reward_amount = original.reward_amount) from public.quests q join original_quests original using (id)), '対象の進行・担当・報酬も変更しない');

-- 対象外の進行中タスクも申請でき、その申請は補完を再実行しても残る。
set local role authenticated;
select set_config('request.jwt.claim.sub', '061d2a98-5e70-4c73-9885-c9808d7c92b0', true);
select public.submit_quest_completion('de98a7ce-ae93-4be6-aea8-4edc14f79d55', auth.uid());
reset role;
select pg_temp.apply_quest_period_backfill();
select pg_temp.assert((select status = 'pending' and recurrence_source_id is null from public.quests
  where id = 'de98a7ce-ae93-4be6-aea8-4edc14f79d55'), '対象外の申請を繰り返しに変えない');
select pg_temp.assert((select count(*) = 1 and bool_and(status = 'pending') from public.quest_logs
  where quest_id = 'de98a7ce-ae93-4be6-aea8-4edc14f79d55'), '対象外の申請履歴を保持する');
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', clock_timestamp() + interval '1 day');
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', clock_timestamp() + interval '1 day');
select pg_temp.assert((select count(*) = 2 and bool_and(reward_amount = 100) from public.quests
  where recurrence_source_id = 'b1731de0-5259-46aa-9734-31240983cd63'), '翌日の「あ」は100 golの1件だけを作る');
select pg_temp.assert((select count(*) = 8 from public.quests where family_id = '26300000-0000-4000-8000-000000000001'), '同期の再送でも3件だけ増え、対象外は複製しない');
select pg_temp.assert((select recurrence_source_id = id and status = 'completed' from public.quests
  where id = '26300000-0000-4000-8000-000000000201'), '別家庭の移行済みタスクはそのまま保持する');

select pg_temp.assert((select count(*) = 3 and bool_and(status = 'completed' and daily_end_minutes = 0)
  from public.quests where family_id = '26300000-0000-4000-8000-000000000003' and recurrence_source_id = id), '家事3件を現在の回の完了済みとして引き継ぐ');
select pg_temp.assert((select count(*) = 3 and bool_and(to_jsonb(q) = to_jsonb(original))
  from public.quests q join original_completed_quests original using (id) where q.recurrence_source_id is null), '完了済みの「あ・い・う」は全列をそのまま履歴として残す');
select pg_temp.assert((select bool_and(q.status = original.status and q.assigned_to = original.assigned_to
  and q.reward_amount = original.reward_amount) from public.quests q join original_completed_quests original using (id)), '繰り返す完了済みも状態・担当・報酬を変えない');
-- 終了直前までは新しい回を作らず、終了日時ちょうどから3件だけ再開する。
select private.sync_quest_periods('26300000-0000-4000-8000-000000000003',
  (select min(period_ends_at) - interval '1 microsecond' from public.quests where family_id = '26300000-0000-4000-8000-000000000003'));
select pg_temp.assert((select count(*) = 6 and bool_and(status = 'completed') from public.quests
  where family_id = '26300000-0000-4000-8000-000000000003'), '次の終了時刻までは全件を完了済みのままにする');
create temp table completed_period_boundary as select min(period_ends_at) as ends_at from public.quests
  where family_id = '26300000-0000-4000-8000-000000000003';
select private.sync_quest_periods('26300000-0000-4000-8000-000000000003', (select ends_at from completed_period_boundary));
select private.sync_quest_periods('26300000-0000-4000-8000-000000000003', (select ends_at from completed_period_boundary));
select pg_temp.assert((select count(*) = 3 and bool_and(status = 'open' and assigned_to is null
  and title in ('お風呂掃除', '宿題', '部屋の掃除')) from public.quests
  where family_id = '26300000-0000-4000-8000-000000000003' and period_starts_at = (select ends_at from completed_period_boundary)), '終了時刻から家事3件だけを未着手として再開し、再送でも増えない');
select pg_temp.apply_quest_period_backfill();
select pg_temp.assert((select count(*) = 9 from public.quests where family_id = '26300000-0000-4000-8000-000000000003'), '補完の再実行でも新しい回を増やさない');
select pg_temp.assert((select count(*) = 6 and bool_and(to_jsonb(l) = to_jsonb(original)) from public.quest_logs l
  join original_completed_logs original using (id)), '完了・承認の履歴を一切書き換えない');
select pg_temp.assert((select balance = 280 from public.users where id = '26300000-0000-4000-8000-000000000032')
  and (select balance = 720 from public.guild_treasuries where family_id = '26300000-0000-4000-8000-000000000003'), '既存報酬を再支払いせず、お財布と金庫の残高を保つ');
select pg_temp.assert(not has_function_privilege('authenticated', 'private.check_quest_period_backfill(uuid[])', 'execute'), '除外IDの指定はクライアントへ公開しない');
rollback;
