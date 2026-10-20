-- Issue #426: 古いクライアントからの操作にも期限と家庭・ロール境界を強制する。
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_expected text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then raise exception '想定と違う拒否: %', sqlerrm; end if;
    return;
  end;
  raise exception '拒否されるはずが成功した: %', p_sql;
end;
$$;

insert into public.families (id, name) values
  ('42600000-0000-4000-8000-000000000001', '426家庭'),
  ('42600000-0000-4000-8000-000000000002', '426別家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('42600000-0000-4000-8000-000000000011', '42600000-0000-4000-8000-000000000001', '426親', 'parent', 0),
  ('42600000-0000-4000-8000-000000000012', '42600000-0000-4000-8000-000000000001', '426子', 'child', 0),
  ('42600000-0000-4000-8000-000000000021', '42600000-0000-4000-8000-000000000002', '426別親', 'parent', 0);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply)
values ('42600000-0000-4000-8000-000000000001', 1000, 1000, 1000);
insert into public.quests (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to, expires_at) values
  ('42600000-0000-4000-8000-000000000101', '42600000-0000-4000-8000-000000000001', '期限切れ未受注', '', 10, 'open', '42600000-0000-4000-8000-000000000011', 'limited', null, clock_timestamp() - interval '1 second'),
  ('42600000-0000-4000-8000-000000000102', '42600000-0000-4000-8000-000000000001', '期限切れ受注中', '', 10, 'accepted', '42600000-0000-4000-8000-000000000011', 'limited', '42600000-0000-4000-8000-000000000012', clock_timestamp() - interval '1 second'),
  ('42600000-0000-4000-8000-000000000103', '42600000-0000-4000-8000-000000000001', '期限前の申請', '', 10, 'accepted', '42600000-0000-4000-8000-000000000011', 'limited', '42600000-0000-4000-8000-000000000012', clock_timestamp() + interval '1 day'),
  ('42600000-0000-4000-8000-000000000104', '42600000-0000-4000-8000-000000000001', '期限なし', '', 10, 'open', '42600000-0000-4000-8000-000000000011', 'limited', null, null),
  ('42600000-0000-4000-8000-000000000105', '42600000-0000-4000-8000-000000000001', 'デイリー', '', 10, 'open', '42600000-0000-4000-8000-000000000011', 'daily', null, null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '42600000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected($q$update public.quests set status = 'accepted', assigned_to = '42600000-0000-4000-8000-000000000012' where id = '42600000-0000-4000-8000-000000000101'$q$, '期限切れ');
select pg_temp.assert_rejected($q$select public.submit_quest_completion('42600000-0000-4000-8000-000000000102', '42600000-0000-4000-8000-000000000012')$q$, '期限切れ');
select pg_temp.assert((select status = 'accepted' from public.quests where id = '42600000-0000-4000-8000-000000000102'), '期限後の申請失敗で受注中を保つ');
select pg_temp.assert(not exists(select 1 from public.quest_logs where quest_id = '42600000-0000-4000-8000-000000000102'), '期限後は申請も通知も作らない');
select public.submit_quest_completion('42600000-0000-4000-8000-000000000103', '42600000-0000-4000-8000-000000000012');
select pg_temp.assert_rejected($q$select public.submit_quest_completion('42600000-0000-4000-8000-000000000103', '42600000-0000-4000-8000-000000000012')$q$, 'not accepted');
select pg_temp.assert_rejected($q$select public.update_quest_deadline('42600000-0000-4000-8000-000000000101', null)$q$, '親だけ');
select pg_temp.assert_rejected($q$update public.quests set expires_at = null where id = '42600000-0000-4000-8000-000000000101'$q$, 'permission denied');

update public.quests set status = 'accepted', assigned_to = '42600000-0000-4000-8000-000000000012' where id in ('42600000-0000-4000-8000-000000000104', '42600000-0000-4000-8000-000000000105');
select public.submit_quest_completion('42600000-0000-4000-8000-000000000104', '42600000-0000-4000-8000-000000000012');
select public.submit_quest_completion('42600000-0000-4000-8000-000000000105', '42600000-0000-4000-8000-000000000012');

select set_config('request.jwt.claim.sub', '42600000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected($q$select public.update_quest_deadline('42600000-0000-4000-8000-000000000101', null)$q$, '同じ家庭');
select set_config('request.jwt.claim.sub', '42600000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected($q$select public.update_quest_deadline('42600000-0000-4000-8000-000000000105', null)$q$, '限定タスク');
select pg_temp.assert_rejected($q$select public.update_quest_deadline('42600000-0000-4000-8000-000000000101', 'infinity')$q$, '実在する日時');

-- 親の作成時にも新しい列を書き込める。日本時間の日時はUTCと同じ瞬間として保存する。
insert into public.quests (family_id, title, description, reward_amount, created_by, category, expires_at)
values ('42600000-0000-4000-8000-000000000001', '426新規', '', 10, '42600000-0000-4000-8000-000000000011', 'limited', '2030-01-01 18:00:00+09');
select pg_temp.assert((select expires_at = '2030-01-01 09:00:00+00'::timestamptz from public.quests where title = '426新規'), '日時のタイムゾーンを保持する');
select pg_temp.assert_rejected($q$insert into public.quests (family_id, title, reward_amount, created_by, category, expires_at) values ('42600000-0000-4000-8000-000000000001', '不正', 10, '42600000-0000-4000-8000-000000000011', 'daily', now())$q$, 'quests_limited_deadline_check');

select public.update_quest_deadline('42600000-0000-4000-8000-000000000103', clock_timestamp() - interval '1 second');
select public.approve_quest_log((select id from public.quest_logs where quest_id = '42600000-0000-4000-8000-000000000103'), '42600000-0000-4000-8000-000000000011');
select pg_temp.assert((select status = 'completed' from public.quests where id = '42600000-0000-4000-8000-000000000103'), '期限前の申請は期限後も承認できる');
select pg_temp.assert((select balance = 10 from public.users where id = '42600000-0000-4000-8000-000000000012'), '期限後の承認でも報酬を1回支払う');
select pg_temp.assert_rejected($q$select public.update_quest_deadline('42600000-0000-4000-8000-000000000103', clock_timestamp() + interval '1 day')$q$, '未完了');

select public.update_quest_deadline('42600000-0000-4000-8000-000000000101', clock_timestamp() + interval '1 day');
select public.update_quest_deadline('42600000-0000-4000-8000-000000000102', null);
select pg_temp.assert((select expires_at is null and status = 'accepted' from public.quests where id = '42600000-0000-4000-8000-000000000102'), '解除しても受注状態を保つ');
select set_config('request.jwt.claim.sub', '42600000-0000-4000-8000-000000000012', true);
update public.quests set status = 'accepted', assigned_to = '42600000-0000-4000-8000-000000000012' where id = '42600000-0000-4000-8000-000000000101';
select public.submit_quest_completion('42600000-0000-4000-8000-000000000102', '42600000-0000-4000-8000-000000000012');
select pg_temp.assert((select status = 'accepted' from public.quests where id = '42600000-0000-4000-8000-000000000101'), '延長後に受注できる');

reset role;
-- セッションが失効した子供は、親ロールの検査より先に共通のPT401で拒否する。
insert into private.child_login_sessions (child_id, active_session_id)
values ('42600000-0000-4000-8000-000000000012', '42600000-0000-4000-8000-000000000201');
set local role authenticated;
select set_config('request.jwt.claims', '{"session_id":"42600000-0000-4000-8000-000000000202"}', true);
do $$
begin
  begin
    perform public.update_quest_deadline('42600000-0000-4000-8000-000000000101', null);
  exception when sqlstate 'PT401' then
    return;
  end;
  raise exception '失効した子供セッションはPT401で拒否する必要があります';
end;
$$;
reset role;
select pg_temp.assert(not has_function_privilege('anon', 'public.update_quest_deadline(uuid,timestamptz)', 'execute'), '未ログインには期限変更RPCを公開しない');
select pg_temp.assert(not has_column_privilege('authenticated', 'public.quests', 'expires_at', 'update'), '期限列の直接UPDATEは公開しない');
rollback;
