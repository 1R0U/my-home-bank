-- Issue #63 フォローアップ（PR #115 レビュー対応その2）--------------------
--
-- approve_quest_log で、transactions への insert が
-- on conflict (quest_log_id) do nothing により実際には行われなかった
-- 場合でも、無条件に users.balance を加算していた。
-- 現状は quest_logs.status = 'pending' の検証により同じ quest_log_id が
-- 二重に承認されることはなく実害はないが、将来ガード条件が変わった際の
-- 事故防止のため、insert が実際に行を挿入した場合のみ残高を加算する
-- ように修正する。

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
  v_inserted_count integer;
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

  get diagnostics v_inserted_count = row_count;

  -- 実際に取引が記帳された場合のみ残高を加算する
  -- （on conflict で何も挿入されなかった場合は加算しない）。
  if v_inserted_count > 0 then
    update users
      set balance = balance + v_reward
      where id = v_user_id;
  end if;
end;
$$;
