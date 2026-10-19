-- Issue #426: 限定タスクの受付期限。既存タスクはNULLのまま期限なしとして扱う。
-- 指定日時ちょうどから受注・完了申請を止める。承認待ち・完了済みの状態は変えない。
alter table public.quests add column expires_at timestamptz;

alter table public.quests add constraint quests_limited_deadline_check
  check (expires_at is null or (category = 'limited' and isfinite(expires_at)));

-- 作成時は親のINSERTポリシーで検証する。期限列の直接UPDATEは許可せず専用RPCだけを使う。
grant insert (expires_at) on public.quests to authenticated;

-- UPDATEの行ロックを取った後に実時刻で検査するため、ロック待ちの間に期限を過ぎても拒否する。
-- 完了申請RPCも同じUPDATEを通る。却下(pending→open)や承認(pending→completed)は止めない。
create function private.guard_quest_deadline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status is distinct from new.status
    and new.status in ('accepted', 'pending')
    and old.category = 'limited'
    and old.expires_at is not null
    and old.expires_at <= clock_timestamp() then
    raise exception '期限切れのタスクは受注・完了申請できません';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_quest_deadline() from public, anon, authenticated;
create trigger guard_quest_deadline_before_update
before update of status on public.quests
for each row execute function private.guard_quest_deadline();

create function public.update_quest_deadline(p_quest_id uuid, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;
  if not public.current_child_session_is_valid() then
    raise exception 'ログインし直してください';
  end if;
  select family_id into v_family_id from public.users where id = auth.uid() and role = 'parent';
  if v_family_id is null then
    raise exception '期限を変更できるのは親だけです';
  end if;
  if p_expires_at is not null and not isfinite(p_expires_at) then
    raise exception '期限は実在する日時を指定してください';
  end if;

  -- 過去の日時も設定でき、その場合は直ちに締め切る。延長・解除しても進行状態や申請は変えない。
  update public.quests set expires_at = p_expires_at
    where id = p_quest_id and family_id = v_family_id and category = 'limited';
  if not found then
    raise exception '同じ家庭の限定タスクだけ期限を変更できます';
  end if;
end;
$$;

revoke all on function public.update_quest_deadline(uuid, timestamptz) from public, anon;
grant execute on function public.update_quest_deadline(uuid, timestamptz) to authenticated;
