-- Issue #63: タスク機能をSupabaseに繋ぐ ------------------------------------

-- 1. quests.category 列を追加（daily/weekly/limited）。既存行は 'daily' 扱いにする。
alter table quests
  add column if not exists category text not null default 'daily'
  check (category in ('daily', 'weekly', 'limited'));

-- 2. quests.status の check制約に 'accepted'（受注中）を追加
alter table quests drop constraint if exists quests_status_check;
alter table quests
  add constraint quests_status_check
  check (status in ('open', 'accepted', 'pending', 'completed'));

-- 3. quests.assigned_to 列を追加（受注した子のid。未受注はnull）
alter table quests
  add column if not exists assigned_to uuid references users(id);

-- 4. 承認関数
--    quest_logs を approved に更新 → quests を completed に更新
--    → transactions に quest_reward として記帳 → users.balance に加算
--    を1トランザクションで実行する（途中失敗時は全てロールバックされる）。
create or replace function approve_quest_log(p_quest_log_id uuid, p_approver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest_id uuid;
  v_user_id uuid;
  v_reward integer;
  v_title text;
begin
  select ql.quest_id, ql.user_id, q.reward_amount::integer, q.title
    into v_quest_id, v_user_id, v_reward, v_title
  from quest_logs ql
  join quests q on q.id = ql.quest_id
  where ql.id = p_quest_log_id
    and ql.status = 'pending'
  for update of ql;

  if v_quest_id is null then
    raise exception 'quest_log not found or not pending: %', p_quest_log_id;
  end if;

  update quest_logs
    set status = 'approved', approved_by = p_approver_id, approved_at = now()
    where id = p_quest_log_id;

  update quests
    set status = 'completed'
    where id = v_quest_id;

  insert into transactions (user_id, type, description, amount, quest_log_id)
  values (v_user_id, 'quest_reward', v_title, v_reward, p_quest_log_id)
  on conflict (quest_log_id) where quest_log_id is not null do nothing;

  update users
    set balance = balance + v_reward
    where id = v_user_id;
end;
$$;

-- 5. 却下関数
--    quest_logs を rejected に更新 → quests を open（未受注・未割当）に戻す。
create or replace function reject_quest_log(p_quest_log_id uuid, p_approver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest_id uuid;
begin
  select ql.quest_id
    into v_quest_id
  from quest_logs ql
  where ql.id = p_quest_log_id
    and ql.status = 'pending'
  for update of ql;

  if v_quest_id is null then
    raise exception 'quest_log not found or not pending: %', p_quest_log_id;
  end if;

  update quest_logs
    set status = 'rejected', approved_by = p_approver_id, approved_at = now()
    where id = p_quest_log_id;

  update quests
    set status = 'open', assigned_to = null
    where id = v_quest_id;
end;
$$;
