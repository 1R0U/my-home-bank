-- Issue #424: 承認されたタスクのお知らせ（get_unseen_quest_rewards / mark_quest_rewards_seen）を確認する。
\set ON_ERROR_STOP on
\o /dev/null

begin;

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

insert into public.families (id, name) values
  ('42400000-0000-4000-8000-000000000001', '424家庭');

insert into public.users (id, family_id, name, role, balance) values
  ('42400000-0000-4000-8000-000000000011', '42400000-0000-4000-8000-000000000001', '424の親', 'parent', 0),
  ('42400000-0000-4000-8000-000000000012', '42400000-0000-4000-8000-000000000001', '424の子A', 'child', 0),
  ('42400000-0000-4000-8000-000000000013', '42400000-0000-4000-8000-000000000001', '424の子B', 'child', 0);

insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000001', 'おさらあらい', '', 100, 'completed', '42400000-0000-4000-8000-000000000011', 'daily', null),
  ('42400000-0000-4000-8000-000000000102', '42400000-0000-4000-8000-000000000001', 'おふろそうじ', '', 50, 'completed', '42400000-0000-4000-8000-000000000011', 'daily', null);

-- 子A: 承認済み2件（古い順に おふろそうじ・おさらあらい）、見せた承認1件、承認待ち1件、却下1件
-- 子B: 承認済み1件
insert into public.quest_logs (id, quest_id, user_id, status, completed_at, approved_by, approved_at, reward_seen_at) values
  ('42400000-0000-4000-8000-000000000201', '42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000012', 'approved', now() - interval '2 hours', '42400000-0000-4000-8000-000000000011', now() - interval '1 hour', null),
  ('42400000-0000-4000-8000-000000000202', '42400000-0000-4000-8000-000000000102', '42400000-0000-4000-8000-000000000012', 'approved', now() - interval '3 hours', '42400000-0000-4000-8000-000000000011', now() - interval '2 hours', null),
  ('42400000-0000-4000-8000-000000000203', '42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000012', 'approved', now() - interval '2 days', '42400000-0000-4000-8000-000000000011', now() - interval '2 days', now() - interval '1 day'),
  ('42400000-0000-4000-8000-000000000204', '42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000012', 'pending', now(), null, null, null),
  ('42400000-0000-4000-8000-000000000205', '42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000012', 'rejected', now(), '42400000-0000-4000-8000-000000000011', now(), null),
  ('42400000-0000-4000-8000-000000000206', '42400000-0000-4000-8000-000000000101', '42400000-0000-4000-8000-000000000013', 'approved', now() - interval '1 hour', '42400000-0000-4000-8000-000000000011', now() - interval '1 hour', null);

-- 承認のときに入った額。タスクの今の報酬（100）と違っても、入った額（80）を返すことを見る
insert into public.transactions (user_id, type, description, amount, quest_log_id) values
  ('42400000-0000-4000-8000-000000000012', 'quest_reward', 'おさらあらい', 80, '42400000-0000-4000-8000-000000000201'),
  ('42400000-0000-4000-8000-000000000012', 'quest_reward', 'おふろそうじ', 50, '42400000-0000-4000-8000-000000000202'),
  ('42400000-0000-4000-8000-000000000013', 'quest_reward', 'おさらあらい', 100, '42400000-0000-4000-8000-000000000206');

-- 子A本人として見る
set role authenticated;
select set_config('request.jwt.claim.sub', '42400000-0000-4000-8000-000000000012', false);

select pg_temp.assert(
  (select array_agg(quest_log_id order by ordinality) = array[
            '42400000-0000-4000-8000-000000000202',
            '42400000-0000-4000-8000-000000000201'
          ]::uuid[]
   from public.get_unseen_quest_rewards() with ordinality),
  '本人の、承認済みでまだ見せていないものだけを、承認された順に返す（承認待ち・却下・見せた分・他人の分は返さない）'
);

select pg_temp.assert(
  (select title = 'おさらあらい' and amount = 80
   from public.get_unseen_quest_rewards()
   where quest_log_id = '42400000-0000-4000-8000-000000000201'),
  '金額はタスクの今の報酬ではなく、承認のときに入った額を返す'
);

-- アプリから直接は「見せた」にできない
select pg_temp.assert_rejected(
  $q$update public.quest_logs set reward_seen_at = now()
     where id = '42400000-0000-4000-8000-000000000201'$q$,
  'quest_logs.reward_seen_at を直接は書き換えられない'
);

-- 他人の承認・承認待ち・却下を混ぜても、本人の承認済みの分だけを記録する
select pg_temp.assert(
  public.mark_quest_rewards_seen(array[
    '42400000-0000-4000-8000-000000000201',
    '42400000-0000-4000-8000-000000000204',
    '42400000-0000-4000-8000-000000000205',
    '42400000-0000-4000-8000-000000000206'
  ]::uuid[]) = 1,
  '本人の承認済みの分だけを記録し、その件数を返す'
);

select pg_temp.assert(
  public.mark_quest_rewards_seen(array['42400000-0000-4000-8000-000000000201']::uuid[]) = 0,
  '記録済みの分をもう一度記録しても何もしない'
);

select pg_temp.assert(
  public.mark_quest_rewards_seen(array[]::uuid[]) = 0 and public.mark_quest_rewards_seen(null) = 0,
  '空・null を渡しても何もしない'
);

select pg_temp.assert(
  (select array_agg(quest_log_id) = array['42400000-0000-4000-8000-000000000202']::uuid[]
   from public.get_unseen_quest_rewards()),
  '記録した分は次から返さない'
);

reset role;
reset request.jwt.claim.sub;

select pg_temp.assert(
  (select reward_seen_at is null from public.quest_logs where id = '42400000-0000-4000-8000-000000000206')
  and (select reward_seen_at is null from public.quest_logs where id = '42400000-0000-4000-8000-000000000204'),
  '他人の承認・承認待ちは記録されていない'
);

-- ログインしていなければ使えない
set role anon;
select pg_temp.assert_rejected('select * from public.get_unseen_quest_rewards()', '未ログインでは取得できない');
select pg_temp.assert_rejected(
  $q$select public.mark_quest_rewards_seen(array['42400000-0000-4000-8000-000000000202']::uuid[])$q$,
  '未ログインでは記録できない'
);
reset role;

-- テスト用の行は残さない
rollback;
