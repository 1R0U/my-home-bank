-- PR #499: 同期が失敗しても作成済みの通知・件数を保ち、同期前の残件数は通知しない。
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;

insert into public.families (id, name) values
  ('49900000-0000-4000-8000-000000000001', '同期失敗の家庭'),
  ('49900000-0000-4000-8000-000000000002', '同期成功の家庭');
insert into public.users (id, family_id, name, role, balance, created_at) values
  ('49900000-0000-4000-8000-000000000011', '49900000-0000-4000-8000-000000000001', '親', 'parent', 0, '2026-10-24 12:00+09'),
  ('49900000-0000-4000-8000-000000000012', '49900000-0000-4000-8000-000000000001', '3日していない子', 'child', 0, '2026-10-21 12:00+09'),
  ('49900000-0000-4000-8000-000000000013', '49900000-0000-4000-8000-000000000001', '登録したばかりの子', 'child', 0, '2026-10-24 12:00+09'),
  ('49900000-0000-4000-8000-000000000021', '49900000-0000-4000-8000-000000000002', '別の親', 'parent', 0, '2026-10-24 12:00+09'),
  ('49900000-0000-4000-8000-000000000022', '49900000-0000-4000-8000-000000000002', '別の子', 'child', 0, '2026-10-24 12:00+09');
insert into public.quests (id, family_id, title, description, reward_amount, category, created_by) values
  ('49900000-0000-4000-8000-000000000101', '49900000-0000-4000-8000-000000000001', '同期で更新するタスク', '', 10, 'daily', '49900000-0000-4000-8000-000000000011'),
  ('49900000-0000-4000-8000-000000000102', '49900000-0000-4000-8000-000000000001', '同期前から見える旧タスク', '', 10, 'daily', '49900000-0000-4000-8000-000000000011'),
  ('49900000-0000-4000-8000-000000000201', '49900000-0000-4000-8000-000000000002', '別の家庭のタスク', '', 10, 'daily', '49900000-0000-4000-8000-000000000021');
update public.quests set period_starts_at = '2026-10-22 00:00+09', period_ends_at = '2026-10-23 00:00+09'
  where id in ('49900000-0000-4000-8000-000000000101', '49900000-0000-4000-8000-000000000201');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null
  where id = '49900000-0000-4000-8000-000000000102';

-- 期間を作成するINSERTだけを失敗させ、通知の作成は妨げない。
create function pg_temp.fail_period_sync()
returns trigger language plpgsql as $$ begin
  if new.family_id = '49900000-0000-4000-8000-000000000001'::uuid then
    raise exception '検証用の期間同期失敗';
  end if;
  return new;
end; $$;
create trigger simulate_period_sync_failure before insert on public.quests
  for each row execute function pg_temp.fail_period_sync();

create temp table notification_count_before as select count(*) as total_count from public.notifications;
create temp table notification_run_result as
  select private.run_scheduled_notifications('2026-10-24 17:00+09') as created_count;

select pg_temp.assert(exists(select 1 from public.notifications
  where user_id = '49900000-0000-4000-8000-000000000012' and dedupe_key = 'inactive:2026-10-24'),
  '同期前に作った「しばらくしていない」通知をロールバックしない');
select pg_temp.assert(not exists(select 1 from public.notifications
  where user_id in ('49900000-0000-4000-8000-000000000012', '49900000-0000-4000-8000-000000000013')
    and dedupe_key = 'daily_left:2026-10-24'), '同期に失敗した子には旧タスクの残件数を通知しない');
select pg_temp.assert(exists(select 1 from public.notifications
  where user_id = '49900000-0000-4000-8000-000000000022' and dedupe_key = 'daily_left:2026-10-24'),
  '同期に成功する別の家庭の子の処理は継続する');
select pg_temp.assert((select created_count >= 2 from notification_run_result)
  and (select created_count from notification_run_result) =
    (select count(*) from public.notifications) - (select total_count from notification_count_before),
  '戻り件数と実際に作成された通知数を一致させる');

rollback;
