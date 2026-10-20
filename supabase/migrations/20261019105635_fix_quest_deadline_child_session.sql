-- Issue #426 / PR #474: 失効した子供セッションを共通のPT401で拒否する。
-- 既存マイグレーションの適用状況にかかわらず使えるよう、追加のマイグレーションで更新する。
create or replace function public.update_quest_deadline(p_quest_id uuid, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;
  perform public.check_child_session();
  select family_id into v_family_id from public.users where id = auth.uid() and role = 'parent';
  if v_family_id is null then
    raise exception '期限を変更できるのは親だけです';
  end if;
  if p_expires_at is not null and not isfinite(p_expires_at) then
    raise exception '期限は実在する日時を指定してください';
  end if;

  -- 過去の日時は即時締切。進行状態と受け付け済みの申請は変えない。
  -- 完了済みは期限を変えても再開しないため、変更を受け付けない。
  update public.quests set expires_at = p_expires_at
    where id = p_quest_id and family_id = v_family_id and category = 'limited' and status <> 'completed';
  if not found then
    raise exception '同じ家庭の未完了の限定タスクだけ期限を変更できます';
  end if;
end;
$$;
