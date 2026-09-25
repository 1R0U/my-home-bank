-- 素のPostgreSQLでSupabase Authを参照するマイグレーションを検証するための最小設定。
-- アプリのマイグレーションには含めず、CIのDBにだけ適用する。
do $$
begin
  create role anon nologin;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then
  null;
end;
$$;

create schema if not exists auth;

-- Auth登録トリガーを空のPostgreSQLでも適用・動作検証できるよう、
-- 今回使うauth.usersの列だけを再現する。アプリのマイグレーションには含めない。
create table if not exists auth.users (
  id uuid primary key,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
