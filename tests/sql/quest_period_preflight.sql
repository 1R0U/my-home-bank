-- PR #499の初回適用前に、稼働中のSupabaseのSQL Editorで実行する。読み取り専用。
-- 完了済みを再開するか、同名のどの行を繰り返すかは、この結果を確認して決める。
-- 同じタイトルだけを根拠に行を削除・統合しない。
begin read only;

-- 1. 家庭・区分・状態ごとの件数。適用後に再確認する場合は生成済みの複製を除く。
select family_id, category, status, count(*) as quest_count
from public.quests q
where category in ('daily', 'weekly')
  and (to_jsonb(q)->>'recurrence_source_id' is null or to_jsonb(q)->>'recurrence_source_id' = q.id::text)
group by family_id, category, status
order by family_id, category, status;

-- 2. 同じ家庭・区分・タイトルが複数ある候補。内容や報酬が違う可能性もある。
select family_id, category, btrim(title) as title, count(*) as quest_count,
  count(*) filter (where status = 'completed') as completed_count,
  array_agg(id order by created_at, id) as quest_ids
from public.quests q
where category in ('daily', 'weekly')
  and (to_jsonb(q)->>'recurrence_source_id' is null or to_jsonb(q)->>'recurrence_source_id' = q.id::text)
group by family_id, category, btrim(title)
having count(*) > 1
order by family_id, category, title;

-- 3. 引き継ぐ対象をIDで確認するための一覧。申請・報酬の履歴は変更しない。
select q.id, q.family_id, q.category, q.title, q.description, q.status, q.reward_amount,
  q.assigned_to, q.created_at,
  (select max(l.completed_at) from public.quest_logs l where l.quest_id = q.id and l.status = 'approved') as last_approved_completion_at
from public.quests q
where q.category in ('daily', 'weekly')
  and (to_jsonb(q)->>'recurrence_source_id' is null or to_jsonb(q)->>'recurrence_source_id' = q.id::text)
order by q.family_id, q.category, q.title, q.created_at, q.id;

commit;
