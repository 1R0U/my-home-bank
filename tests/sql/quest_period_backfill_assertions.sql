-- PR #499: 稼働DBで確認した5件を再現し、指定した同名1件だけを繰り返す。
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

insert into public.families (id, name) values ('00000000-0000-4000-8000-000000000020', '移行対象の家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('26300000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000020', '親', 'parent', 0),
  ('061d2a98-5e70-4c73-9885-c9808d7c92b0', '00000000-0000-4000-8000-000000000020', '子A', 'child', 0),
  ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000020', '子B', 'child', 0);
insert into public.quests (id, family_id, title, reward_amount, category, status, assigned_to, created_by) values
  ('427714d8-a0d3-4c82-af5d-92220c2611fc', '00000000-0000-4000-8000-000000000020', 'あ', 10, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011'),
  ('de98a7ce-ae93-4be6-aea8-4edc14f79d55', '00000000-0000-4000-8000-000000000020', 'あ', 10, 'daily', 'accepted', '061d2a98-5e70-4c73-9885-c9808d7c92b0', '26300000-0000-4000-8000-000000000011'),
  ('b1731de0-5259-46aa-9734-31240983cd63', '00000000-0000-4000-8000-000000000020', 'あ', 100, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011'),
  ('f95ddcd8-4a90-4348-8a6c-b6e849785ab9', '00000000-0000-4000-8000-000000000020', 'い', 100, 'daily', 'accepted', '00000000-0000-4000-8000-000000000000', '26300000-0000-4000-8000-000000000011'),
  ('0f0eedf5-ab85-4d0f-9b5e-d94a4b4a5a98', '00000000-0000-4000-8000-000000000020', 'か', 50, 'daily', 'open', null, '26300000-0000-4000-8000-000000000011');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null, daily_end_minutes = null;
create temp table original_quests as select * from public.quests;
select pg_temp.reject('select private.check_quest_period_backfill(null)', '除外するクエストIDが不正');
select pg_temp.reject('select private.check_quest_period_backfill(array[null]::uuid[])', '除外するクエストIDが不正');

update public.quests set reward_amount = 101 where id = 'b1731de0-5259-46aa-9734-31240983cd63';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの既存クエストが変更');
select pg_temp.assert(not exists(select 1 from public.quests where recurrence_source_id is not null), '確認時と違う内容では補完しない');
update public.quests set reward_amount = 100 where id = 'b1731de0-5259-46aa-9734-31240983cd63';
update public.quests set id = '26300000-0000-4000-8000-000000000099' where id = '427714d8-a0d3-4c82-af5d-92220c2611fc';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '確認済みの既存クエストが変更');
update public.quests set id = '427714d8-a0d3-4c82-af5d-92220c2611fc' where id = '26300000-0000-4000-8000-000000000099';

-- 今回の確認を、ほかの未確認の完了済み・同名候補へ広げない。
insert into public.quests (id, family_id, title, reward_amount, category, status, created_by) values
  ('26300000-0000-4000-8000-000000000098', '00000000-0000-4000-8000-000000000020', '別の完了済み', 10, 'daily', 'completed', '26300000-0000-4000-8000-000000000011');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null
  where id = '26300000-0000-4000-8000-000000000098';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（完了済み）');
update public.quests set title = 'あ', status = 'open' where id = '26300000-0000-4000-8000-000000000098';
select pg_temp.reject('select pg_temp.apply_quest_period_backfill()', '未確認です（同名の行が複数）');
select pg_temp.assert(not exists(select 1 from public.quests where recurrence_source_id is not null), '未確認の候補が増えた場合も一部だけ補完しない');
delete from public.quests where id = '26300000-0000-4000-8000-000000000098';

select pg_temp.apply_quest_period_backfill();
select pg_temp.assert((select count(*) = 3 from public.quests where recurrence_source_id = id), '100 golの「あ」と「い」「か」の3件だけを設定元にする');
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
select private.sync_quest_periods('00000000-0000-4000-8000-000000000020', clock_timestamp() + interval '1 day');
select private.sync_quest_periods('00000000-0000-4000-8000-000000000020', clock_timestamp() + interval '1 day');
select pg_temp.assert((select count(*) = 2 and bool_and(reward_amount = 100) from public.quests
  where recurrence_source_id = 'b1731de0-5259-46aa-9734-31240983cd63'), '翌日の「あ」は100 golの1件だけを作る');
select pg_temp.assert((select count(*) = 8 from public.quests), '同期の再送でも3件だけ増え、対象外は複製しない');
select pg_temp.assert(not has_function_privilege('authenticated', 'private.check_quest_period_backfill(uuid[])', 'execute'), '除外IDの指定はクライアントへ公開しない');
rollback;
