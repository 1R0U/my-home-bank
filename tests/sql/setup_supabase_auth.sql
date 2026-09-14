-- 素のPostgreSQLでSupabase Authを参照するマイグレーションを検証するための最小設定。
-- アプリのマイグレーションには含めず、CIのDBにだけ適用する。
create role anon nologin;
create role authenticated nologin;
create schema auth;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
