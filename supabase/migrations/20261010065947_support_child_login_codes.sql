-- Issue #264: メール・パスワードを持たない子供のコードログイン。
-- 平文コードは発行時に親へ1回だけ返し、DBにはSHA-256だけを保存する。
create table private.child_login_codes (
  child_id uuid primary key references public.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table private.child_login_sessions (
  child_id uuid primary key references public.users(id) on delete cascade,
  active_session_id uuid,
  attempt_id uuid,
  attempt_expires_at timestamptz
);

create table private.child_login_attempts (
  bucket_key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on private.child_login_codes, private.child_login_sessions,
  private.child_login_attempts from public, anon, authenticated;

create function public.current_child_session_is_valid()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from private.child_login_sessions s
    where s.child_id = auth.uid()
      and (s.active_session_id is null or s.active_session_id::text is distinct from
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id'))
  )
$$;
revoke all on function public.current_child_session_is_valid() from public, anon;
grant execute on function public.current_child_session_is_valid() to anon, authenticated, service_role;

-- security definer RPCも入口で拒否する。RLSだけではRPC内部の管理者権限を止められない。
create function public.check_child_session()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_child_session_is_valid() then
    raise sqlstate 'PT401' using message = '別の端末でログインしました。親から新しいコードをもらってください';
  end if;
end;
$$;
revoke all on function public.check_child_session() from public, anon;
grant execute on function public.check_child_session() to anon, authenticated, service_role;

-- 既存の別用途フックは上書きせず、適用を止めて担当者に統合を依頼する。
do $$
declare v_hook text;
begin
  select split_part(setting, '=', 2) into v_hook
  from pg_roles r cross join lateral unnest(r.rolconfig) setting
  where r.rolname = 'authenticator' and setting like 'pgrst.db_pre_request=%';
  if coalesce(v_hook, '') not in ('', 'public.check_child_session') then
    raise exception '既存のPostgRESTフックがあります（%）。check_child_sessionとの統合を確認してください', v_hook;
  end if;
  alter role authenticator set pgrst.db_pre_request = 'public.check_child_session';
end;
$$;
notify pgrst, 'reload config';

-- Realtime / Storageには上のフックが走らないので、RLSにも同じ検査を追加する。
-- 既存ポリシーの許可範囲を広げないrestrictiveポリシー。
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'users', 'families', 'guild_treasuries', 'economy_transactions', 'quests',
    'quest_logs', 'transactions', 'bank_accounts', 'bank_operations',
    'store_item_requests', 'task_reports', 'store_items', 'placed_decorations',
    'owned_items', 'equipped_items', 'character_appearances', 'character_palettes',
    'loans', 'loan_repayments', 'economy_settings', 'economy_monthly_snapshots',
    'wallet_circulation_tracking', 'wallet_circulation_changes', 'savings_settings',
    'savings_accounts', 'savings_monthly_runs', 'savings_interest_months', 'notifications'
  ] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated
      using ((select public.current_child_session_is_valid()))
      with check ((select public.current_child_session_is_valid()))',
      v_table || '_active_child_session', v_table);
  end loop;
end;
$$;
create policy storage_active_child_session on storage.objects as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

create function public.issue_child_login_code(p_child_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
  v_code text := '';
  v_random bigint := ('x' || left(replace(gen_random_uuid()::text, '-', ''), 10))::bit(40)::bigint;
  v_expires timestamptz := now() + interval '10 minutes';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  perform public.check_child_session();
  select family_id into v_family from public.users
    where id = auth.uid() and role = 'parent';
  if v_family is null then raise exception 'コードを発行できるのは家族のある親だけです'; end if;
  -- 発行と消費を子供の行で直列化する。
  perform 1 from public.users where id = p_child_id and role = 'child'
    and family_id = v_family for update;
  if not found then raise exception '同じ家族の子供を選んでください'; end if;
  if not exists (select 1 from auth.users where id = p_child_id
    and email like 'child-%@children.my-home-bank.invalid') then
    raise exception '子供の認証アカウントが見つかりません';
  end if;
  if exists (select 1 from private.child_login_sessions where child_id = p_child_id
    and attempt_id is not null and attempt_expires_at > now()) then
    raise exception 'ログイン処理中です。少し待ってからお試しください';
  end if;
  if exists (select 1 from private.child_login_codes where child_id = p_child_id
    and created_at > now() - interval '30 seconds') then
    raise exception '再発行は30秒待ってからお試しください';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, ((v_random >> (i * 5)) & 31)::integer + 1, 1);
  end loop;
  insert into private.child_login_codes (child_id, code_hash, created_at, expires_at)
  values (p_child_id, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now(), v_expires)
  on conflict (child_id) do update set code_hash = excluded.code_hash,
    created_at = excluded.created_at, expires_at = excluded.expires_at, used_at = null;
  return jsonb_build_object('code', v_code, 'expiresAt', v_expires);
end;
$$;
revoke all on function public.issue_child_login_code(uuid) from public, anon;
grant execute on function public.issue_child_login_code(uuid) to authenticated;

-- ログイン前なので、検証済みEdge Functionだけが管理者として呼ぶ。
-- 失敗を例外にしないのは、試行回数の書き込みをロールバックさせないため。
create function public.consume_child_login_code(p_code_hash text, p_client_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_email text;
  v_attempt uuid := gen_random_uuid();
  v_key text;
  v_count integer;
  v_limited boolean := false;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  delete from private.child_login_attempts where window_start < now() - interval '1 hour';
  foreach v_key in array array['global', p_client_hash] loop
    insert into private.child_login_attempts (bucket_key, window_start, attempts)
    values (v_key, date_trunc('minute', now()), 1)
    on conflict (bucket_key) do update set
      attempts = case when child_login_attempts.window_start = excluded.window_start
        then child_login_attempts.attempts + 1 else 1 end,
      window_start = excluded.window_start
    returning attempts into v_count;
    v_limited := v_limited or v_count > case when v_key = 'global' then 300 else 10 end;
  end loop;
  if v_limited then return jsonb_build_object('error', 'rate_limited'); end if;
  select child_id into v_child from private.child_login_codes
    where code_hash = p_code_hash and used_at is null and expires_at > now();
  if v_child is null then return jsonb_build_object('error', 'invalid_code'); end if;
  perform 1 from public.users where id = v_child and role = 'child' for update;
  if not found then return jsonb_build_object('error', 'invalid_code'); end if;
  select email into v_email from auth.users where id = v_child;
  if v_email is null or v_email not like 'child-%@children.my-home-bank.invalid' then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  if exists (select 1 from private.child_login_sessions where child_id = v_child
    and attempt_id is not null and attempt_expires_at > now()) then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  update private.child_login_codes set used_at = now()
    where child_id = v_child and code_hash = p_code_hash and used_at is null and expires_at > now();
  if not found then return jsonb_build_object('error', 'invalid_code'); end if;
  insert into private.child_login_sessions (child_id, attempt_id, attempt_expires_at)
  values (v_child, v_attempt, now() + interval '2 minutes')
  on conflict (child_id) do update set attempt_id = excluded.attempt_id,
    attempt_expires_at = excluded.attempt_expires_at;
  return jsonb_build_object('childId', v_child, 'email', v_email, 'attemptId', v_attempt);
end;
$$;

create function public.finish_child_login(p_child_id uuid, p_attempt_id uuid, p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.child_login_sessions set
    active_session_id = coalesce(p_session_id, active_session_id),
    attempt_id = null, attempt_expires_at = null
  where child_id = p_child_id and attempt_id = p_attempt_id
    and (p_session_id is null or attempt_expires_at > now());
  return found;
end;
$$;
revoke all on function public.consume_child_login_code(text, text),
  public.finish_child_login(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_child_login_code(text, text),
  public.finish_child_login(uuid, uuid, uuid) to service_role;

-- 親が確認できるのは同じ家族の子供だけ。他の親・別家庭には広げない。
create policy transactions_select_family_child on public.transactions for select to authenticated
using (exists (
  select 1 from public.users actor join public.users child on child.family_id = actor.family_id
  where actor.id = auth.uid() and actor.role = 'parent'
    and child.id = transactions.user_id and child.role = 'child'
));
create policy bank_accounts_select_family_child on public.bank_accounts for select to authenticated
using (exists (
  select 1 from public.users actor join public.users child on child.family_id = actor.family_id
  where actor.id = auth.uid() and actor.role = 'parent'
    and child.id = bank_accounts.user_id and child.role = 'child'
));
