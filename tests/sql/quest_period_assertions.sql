-- Issue #263: 期間・担当の境界、前の期間の承認、全員への独立した支払い。
\set ON_ERROR_STOP on
\o /dev/null
begin;
create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
end; $$;
create function pg_temp.reject(p_sql text, p_expected text)
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then raise exception '想定と違う拒否: %', sqlerrm; end if;
    return;
  end;
  raise exception '拒否されるはずが成功: %', p_sql;
end; $$;

select pg_temp.assert((select starts_at = '2025-12-30 15:00Z' and ends_at = '2026-01-06 15:00Z'
  from private.quest_period('weekly', 3, '2026-01-01 12:00+09')), '水曜始まり・年越し');
select pg_temp.assert((select starts_at = '2028-02-28 15:00Z' and ends_at = '2028-02-29 15:00Z'
  from private.quest_period('daily', null, '2028-02-29 23:59:59+09')), 'デイリーのうるう日');
select pg_temp.assert(not exists(select 1 from private.quest_period('limited', null, now())), '限定は繰り返さない');
select pg_temp.assert((select starts_at = '2025-12-31 09:30Z' and ends_at = '2026-01-01 09:30Z'
  from private.quest_period('daily', null, '2026-01-01 18:29:59+09', 1110)), 'デイリー終了時刻の24時間前から開始');
select pg_temp.assert((select starts_at = '2026-01-01 09:30Z' and ends_at = '2026-01-02 09:30Z'
  from private.quest_period('daily', null, '2026-01-01 18:30+09', 1110)), '終了時刻ちょうどで次のデイリー');
select pg_temp.reject($q$select * from private.quest_period('daily', null, now(), 1440)$q$, '終了時刻');
select pg_temp.reject($q$select * from private.quest_period('weekly', null, now())$q$, '開始曜日');
do $$ declare d integer; s timestamptz; begin
  for d in 0..6 loop
    s := '2026-10-18 00:00+09'::timestamptz + d * interval '1 day';
    perform pg_temp.assert((select starts_at = s and ends_at = s + interval '7 days' from private.quest_period('weekly', d, s)), '全曜日の開始境界');
    perform pg_temp.assert((select ends_at = s from private.quest_period('weekly', d, s - interval '1 microsecond')), '境界直前は前の週');
  end loop;
end; $$;

insert into public.families (id, name) values
  ('26300000-0000-4000-8000-000000000001', '263家庭'), ('26300000-0000-4000-8000-000000000002', '263別家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('26300000-0000-4000-8000-000000000011', '26300000-0000-4000-8000-000000000001', '親', 'parent', 0),
  ('26300000-0000-4000-8000-000000000012', '26300000-0000-4000-8000-000000000001', '子A', 'child', 0),
  ('26300000-0000-4000-8000-000000000013', '26300000-0000-4000-8000-000000000001', '子B', 'child', 0),
  ('26300000-0000-4000-8000-000000000021', '26300000-0000-4000-8000-000000000002', '別親', 'parent', 0);
insert into public.guild_treasuries (family_id, balance, initial_supply, total_supply)
values ('26300000-0000-4000-8000-000000000001', 1000, 1000, 1000);
-- 期間列が未設定だった既存行を再現し、実際の補完SQLで進行・申請・報酬を保つことを確認する。
insert into public.quests (id, family_id, title, description, reward_amount, category, status, assigned_to, created_by)
values ('26300000-0000-4000-8000-000000000101', '26300000-0000-4000-8000-000000000001', '既存の週課', '', 25, 'weekly', 'pending', '26300000-0000-4000-8000-000000000012', '26300000-0000-4000-8000-000000000011');
insert into public.quest_logs (quest_id, user_id, status)
values ('26300000-0000-4000-8000-000000000101', '26300000-0000-4000-8000-000000000012', 'pending');
update public.quests set recurrence_source_id = null, period_starts_at = null, period_ends_at = null, week_start_day = null
where id = '26300000-0000-4000-8000-000000000101';
\ir ../../supabase/migrations/20261024061541_backfill_quest_periods.sql
select pg_temp.assert((select recurrence_source_id = id and week_start_day = 1 and status = 'pending' and reward_amount = 25
  and assigned_to = '26300000-0000-4000-8000-000000000012' from public.quests where id = '26300000-0000-4000-8000-000000000101'), '既存の進行・報酬を変えず月曜始まりで補完する');
select pg_temp.assert((select status = 'pending' from public.quest_logs where quest_id = '26300000-0000-4000-8000-000000000101'), '既存の申請を維持する');
set local role authenticated;
select set_config('request.jwt.claim.sub', '26300000-0000-4000-8000-000000000011', true);
select public.create_quest('26300000-0000-4000-8000-000000000001', '全員の日課', '', 10, 'daily', true, 'all', null, null, null);
select public.create_quest('26300000-0000-4000-8000-000000000001', '指定の子', '', 20, 'weekly', false, 'specific', '26300000-0000-4000-8000-000000000012', 6, null);
select public.create_quest('26300000-0000-4000-8000-000000000001', '先着', '', 30, 'daily', false, 'first', null, null, null);
select public.create_quest('26300000-0000-4000-8000-000000000001', '全員の限定', '', 40, 'limited', false, 'all', null, null, null);
select pg_temp.assert((select count(*) = 2 from public.quests where title = '全員の日課'), '全員は子供1人につき1実施');
select pg_temp.assert((select count(*) = 2 from public.quests where title = '全員の限定'), '限定も全員を指定できる');
select public.update_quest_deadline((select id from public.quests where title = '全員の限定' limit 1), '2030-01-01 18:00+09');
select pg_temp.assert((select bool_and(expires_at = '2030-01-01 18:00+09'::timestamptz) from public.quests where title = '全員の限定'), '全員向け限定の期限をまとめて変更する');
select pg_temp.reject($q$select public.create_quest('26300000-0000-4000-8000-000000000001', '不正', '', 10, 'weekly', false, 'first', null, null, null)$q$, '開始曜日');
select pg_temp.reject($q$select public.create_quest('26300000-0000-4000-8000-000000000001', '不正', '', 10, 'daily', false, 'specific', '26300000-0000-4000-8000-000000000021', null, null)$q$, '同じ家庭の子');
select pg_temp.reject($q$select public.create_quest('26300000-0000-4000-8000-000000000002', '不正', '', 10, 'daily', false, 'first', null, null, null)$q$, '同じ家庭の親');

select set_config('request.jwt.claim.sub', '26300000-0000-4000-8000-000000000013', true);
select pg_temp.reject($q$update public.quests set status = 'accepted', assigned_to = '26300000-0000-4000-8000-000000000013' where title = '指定の子'$q$, '指定された子');
select pg_temp.reject($q$select public.create_quest('26300000-0000-4000-8000-000000000001', '不正', '', 10, 'daily', false, 'first', null, null, null)$q$, '親');
update public.quests set status = 'accepted', assigned_to = '26300000-0000-4000-8000-000000000013'
  where title = '全員の日課' and target_child_id = '26300000-0000-4000-8000-000000000013';
select public.submit_quest_completion((select id from public.quests where title = '全員の日課' and target_child_id = auth.uid()), auth.uid());
select set_config('request.jwt.claim.sub', '26300000-0000-4000-8000-000000000012', true);
update public.quests set status = 'accepted', assigned_to = '26300000-0000-4000-8000-000000000012'
  where title in ('全員の日課', '先着') and (target_child_id = auth.uid() or target_child_id is null);
select public.submit_quest_completion((select id from public.quests where title = '全員の日課' and target_child_id = auth.uid()), auth.uid());

reset role;
-- 期限を過去にして、前の期間の承認待ちと進行中を再現する。
update public.quests set period_starts_at = period_starts_at - interval '1 day', period_ends_at = period_ends_at - interval '1 day'
  where family_id = '26300000-0000-4000-8000-000000000001' and category = 'daily';
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', clock_timestamp());
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', clock_timestamp());
select pg_temp.assert((select count(*) = 4 from public.quests where title = '全員の日課'), '次の期間は2実施だけ作り、同期を再送しても増やさない');
select pg_temp.assert((select count(*) = 2 from public.quests where title = '全員の限定'), '同期しても限定は増やさない');
set local role authenticated;
select set_config('request.jwt.claim.sub', '26300000-0000-4000-8000-000000000012', true);
select pg_temp.reject($q$select public.submit_quest_completion((select id from public.quests where title = '先着' and status = 'accepted'), auth.uid())$q$, '期間が終了');
select pg_temp.assert((select count(*) = 4 from public.get_quests('26300000-0000-4000-8000-000000000001') where title = '全員の日課'), '現在の実施と前の期間の申請を取得する');
select pg_temp.assert((select count(*) = 1 from public.get_quests('26300000-0000-4000-8000-000000000001') where title = '先着'), '過去の進行中は現在の一覧に混ぜない');
select set_config('request.jwt.claim.sub', '26300000-0000-4000-8000-000000000011', true);
select public.approve_quest_log(id, auth.uid()) from public.quest_logs
  where family_id = '26300000-0000-4000-8000-000000000001' and status = 'pending'
    and quest_id in (select id from public.quests where title = '全員の日課');
select pg_temp.assert((select count(*) = 2 from public.quests where title = '全員の日課' and status = 'open'), '前の期間の承認で現在の状態を変更しない');
select pg_temp.assert((select bool_and(balance = 10) from public.users where family_id = '26300000-0000-4000-8000-000000000001' and role = 'child'), '全員に表示額を1人ずつ支払う');
select pg_temp.assert((select balance = 980 from public.guild_treasuries where family_id = '26300000-0000-4000-8000-000000000001'), '金庫から2人分を引く');
select pg_temp.reject($q$select public.sync_quest_periods('26300000-0000-4000-8000-000000000002')$q$, '同じ家庭');
-- 旧クライアントの直接INSERTにも期間を補い、privateスキーマの権限は公開しない。
insert into public.quests (family_id, title, description, reward_amount, category, created_by)
values ('26300000-0000-4000-8000-000000000001', '旧クライアント', '', 10, 'daily', auth.uid());
select pg_temp.assert((select recurrence_source_id = id and daily_end_minutes = 0 and period_ends_at is not null from public.quests where title = '旧クライアント'), '旧クライアントの作成も継続できる');
reset role;
-- 通知時にも現在の実施を用意し、全員の分を子供の数だけ重複して数えない。
select private.run_scheduled_notifications(((clock_timestamp() at time zone 'Asia/Tokyo')::date + time '20:00') at time zone 'Asia/Tokyo');
select pg_temp.assert((select count(*) = 2 from public.notifications
  where user_id in ('26300000-0000-4000-8000-000000000012', '26300000-0000-4000-8000-000000000013') and title = 'きょうの デイリータスクが あと3こ あるよ'), '自分のデイリーと先着分だけ残件数を知らせる');
set local role authenticated;
select public.create_quest('26300000-0000-4000-8000-000000000001', '18時30分終了', '', 15, 'daily', false, 'specific', '26300000-0000-4000-8000-000000000012', null, null, 1110);
select pg_temp.assert((select daily_end_minutes = 1110 and period_ends_at - period_starts_at = interval '24 hours'
  and (period_ends_at at time zone 'Asia/Tokyo')::time = time '18:30' from public.quests where title = '18時30分終了'), '終了時刻を保存して24時間前から開始する');
reset role;
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', (select period_ends_at from public.quests where title = '18時30分終了'));
select pg_temp.assert((select count(*) = 2 and bool_and(daily_end_minutes = 1110) from public.quests where title = '18時30分終了'), '次の回にも終了時刻を引き継ぐ');
select private.sync_quest_periods('26300000-0000-4000-8000-000000000001', (select max(period_ends_at) + interval '3 days' from public.quests where title = '18時30分終了'));
select pg_temp.assert((select count(*) = 3 from public.quests where title = '18時30分終了'), '取得しなかった過去の回を埋めない');
select pg_temp.assert(not has_function_privilege('authenticated', 'private.sync_quest_periods(uuid,timestamptz)', 'execute'), '任意の時計で同期できない');
select pg_temp.assert(not has_function_privilege('anon', 'public.create_quest(uuid,text,text,bigint,text,boolean,text,uuid,integer,timestamptz,integer)', 'execute'), '未ログインから作成できない');
rollback;
