-- Issue #63 フォローアップ（PR #115 CodeRabbitレビュー対応）--------------------
--
-- submitQuestCompletion が「quest_logs への insert」と「quests の update」に
-- 分かれており、accepted であることの検証もなかったため、連打（二重送信）で
-- pending の quest_log が複数作成され、承認のたびに報酬が重複加算される
-- リスクがあった。1つのRPCに統合し、DB側で status='accepted' かつ
-- assigned_to=p_user_id であることを検証してから quest_logs に登録する。

create or replace function submit_quest_completion(p_quest_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- accepted かつ自分が受注中の場合のみ pending に進める。
  -- 条件を満たさない場合（未受注・他の人が受注中・既に承認待ち等）は
  -- 0件更新となり、下の found チェックで弾かれる。
  -- 2回目以降の連打は、1回目でstatusが既にpendingに変わっているため
  -- ここで弾かれ、quest_logsへの重複登録を防げる。
  update quests
    set status = 'pending'
    where id = p_quest_id
      and status = 'accepted'
      and assigned_to = p_user_id;

  if not found then
    raise exception 'quest not found, not accepted, or not assigned to this user: %', p_quest_id;
  end if;

  insert into quest_logs (quest_id, user_id)
  values (p_quest_id, p_user_id);
end;
$$;

-- 注意（既知の制約・Phase 2で対応予定）:
-- approve_quest_log / reject_quest_log / submit_quest_completion は
-- security definer で実行されるが、auth.uid() と p_approver_id / p_user_id の
-- 突き合わせ、親ロール・family所属の検証は行っていない。
-- これは、このアプリがまだ Supabase Auth と連携しておらず（モックログインのみ）、
-- 現状 auth.uid() が実行時に取得できないための一時的な割り切りであり、
-- RLS を Phase 2で有効化する際に、実認証と合わせて対応する。
