-- Issue #208: SECURITY DEFINER RPCがRLSを迂回して他家庭を操作しないようにする。
-- 既存の処理本体はprivateへ移し、public側の認証・家庭検証ラッパーだけを公開する。

create or replace function private.set_quest_log_family_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest_family_id uuid;
  v_user_family_id uuid;
begin
  select family_id into v_quest_family_id
  from public.quests where id = new.quest_id;
  select family_id into v_user_family_id
  from public.users where id = new.user_id;

  if v_quest_family_id is null or v_user_family_id is distinct from v_quest_family_id then
    raise exception 'クエストと報告者の家庭が一致しません';
  end if;
  if new.family_id is not null and new.family_id is distinct from v_quest_family_id then
    raise exception '指定された家庭がクエストの家庭と一致しません';
  end if;

  new.family_id := v_quest_family_id;
  return new;
end;
$$;

revoke all on function private.set_quest_log_family_id() from public, anon, authenticated;

create trigger set_quest_log_family_id_before_insert
before insert on public.quest_logs
for each row execute function private.set_quest_log_family_id();

alter function public.submit_quest_completion(uuid, uuid) rename to submit_quest_completion_unchecked;
alter function public.submit_quest_completion_unchecked(uuid, uuid) set schema private;
alter function public.approve_quest_log(uuid, uuid) rename to approve_quest_log_unchecked;
alter function public.approve_quest_log_unchecked(uuid, uuid) set schema private;
alter function public.reject_quest_log(uuid, uuid) rename to reject_quest_log_unchecked;
alter function public.reject_quest_log_unchecked(uuid, uuid) set schema private;
alter function public.purchase_store_item(uuid, uuid) rename to purchase_store_item_unchecked;
alter function public.purchase_store_item_unchecked(uuid, uuid) set schema private;
alter function public.bank_deposit(uuid, numeric) rename to bank_deposit_unchecked;
alter function public.bank_deposit_unchecked(uuid, numeric) set schema private;
alter function public.bank_withdraw(uuid, numeric) rename to bank_withdraw_unchecked;
alter function public.bank_withdraw_unchecked(uuid, numeric) set schema private;
alter function public.bank_borrow(uuid, numeric) rename to bank_borrow_unchecked;
alter function public.bank_borrow_unchecked(uuid, numeric) set schema private;
alter function public.bank_repay(uuid, numeric) rename to bank_repay_unchecked;
alter function public.bank_repay_unchecked(uuid, numeric) set schema private;

revoke all on function private.submit_quest_completion_unchecked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.approve_quest_log_unchecked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.reject_quest_log_unchecked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.purchase_store_item_unchecked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.bank_deposit_unchecked(uuid, numeric) from public, anon, authenticated;
revoke all on function private.bank_withdraw_unchecked(uuid, numeric) from public, anon, authenticated;
revoke all on function private.bank_borrow_unchecked(uuid, numeric) from public, anon, authenticated;
revoke all on function private.bank_repay_unchecked(uuid, numeric) from public, anon, authenticated;

create function public.submit_quest_completion(p_quest_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_user_id then
      raise exception '本人以外のクエスト完了報告はできません';
    end if;
    if not exists (
      select 1 from public.quests
      where id = p_quest_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭のクエストは操作できません';
    end if;
  end if;
  perform private.submit_quest_completion_unchecked(p_quest_id, p_user_id);
end;
$$;

create function public.approve_quest_log(p_quest_log_id uuid, p_approver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_approver_id then
      raise exception '承認者がログイン利用者と一致しません';
    end if;
    if not exists (
      select 1 from public.users
      where id = auth.uid() and role = 'parent'
    ) then
      raise exception '親だけがクエストを承認できます';
    end if;
    if not exists (
      select 1 from public.quest_logs
      where id = p_quest_log_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭の完了報告は操作できません';
    end if;
  end if;
  perform private.approve_quest_log_unchecked(p_quest_log_id, p_approver_id);
end;
$$;

create function public.reject_quest_log(p_quest_log_id uuid, p_approver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_approver_id then
      raise exception '却下者がログイン利用者と一致しません';
    end if;
    if not exists (
      select 1 from public.users
      where id = auth.uid() and role = 'parent'
    ) then
      raise exception '親だけがクエストを却下できます';
    end if;
    if not exists (
      select 1 from public.quest_logs
      where id = p_quest_log_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭の完了報告は操作できません';
    end if;
  end if;
  perform private.reject_quest_log_unchecked(p_quest_log_id, p_approver_id);
end;
$$;

create function public.purchase_store_item(p_item_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_user_id then
      raise exception '本人以外の商品購入はできません';
    end if;
    if not exists (
      select 1 from public.store_items
      where id = p_item_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭の商品は購入できません';
    end if;
  end if;
  perform private.purchase_store_item_unchecked(p_item_id, p_user_id);
end;
$$;

create function public.bank_deposit(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (auth.uid() is null and session_user is distinct from current_user)
     or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception '本人以外の口座は操作できません';
  end if;
  perform private.bank_deposit_unchecked(p_user_id, p_amount);
end;
$$;

create function public.bank_withdraw(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (auth.uid() is null and session_user is distinct from current_user)
     or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception '本人以外の口座は操作できません';
  end if;
  perform private.bank_withdraw_unchecked(p_user_id, p_amount);
end;
$$;

create function public.bank_borrow(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (auth.uid() is null and session_user is distinct from current_user)
     or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception '本人以外の口座は操作できません';
  end if;
  perform private.bank_borrow_unchecked(p_user_id, p_amount);
end;
$$;

create function public.bank_repay(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (auth.uid() is null and session_user is distinct from current_user)
     or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception '本人以外の口座は操作できません';
  end if;
  perform private.bank_repay_unchecked(p_user_id, p_amount);
end;
$$;

revoke all on function public.submit_quest_completion(uuid, uuid) from public, anon;
revoke all on function public.approve_quest_log(uuid, uuid) from public, anon;
revoke all on function public.reject_quest_log(uuid, uuid) from public, anon;
revoke all on function public.purchase_store_item(uuid, uuid) from public, anon;
revoke all on function public.bank_deposit(uuid, numeric) from public, anon;
revoke all on function public.bank_withdraw(uuid, numeric) from public, anon;
revoke all on function public.bank_borrow(uuid, numeric) from public, anon;
revoke all on function public.bank_repay(uuid, numeric) from public, anon;

grant execute on function public.submit_quest_completion(uuid, uuid) to authenticated;
grant execute on function public.approve_quest_log(uuid, uuid) to authenticated;
grant execute on function public.reject_quest_log(uuid, uuid) to authenticated;
grant execute on function public.purchase_store_item(uuid, uuid) to authenticated;
grant execute on function public.bank_deposit(uuid, numeric) to authenticated;
grant execute on function public.bank_withdraw(uuid, numeric) to authenticated;
grant execute on function public.bank_borrow(uuid, numeric) to authenticated;
grant execute on function public.bank_repay(uuid, numeric) to authenticated;
