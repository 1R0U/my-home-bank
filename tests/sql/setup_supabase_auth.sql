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
  email text,
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

-- Issue #311: Supabase Storage（storage.buckets / storage.objects）を参照する
-- マイグレーションを素のPostgreSQLでも検証できるよう、最小限の列だけを再現する。
-- 実際のSupabaseプロジェクトでは拡張機能として最初から存在する。アプリの
-- マイグレーションには含めない（auth と同じ方針）。
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  -- Supabaseが実際にアップロード時へ設定する列（文字列化したuuid）。
  -- store_item_images_select_own_upload / delete_own_upload（Issue #311、PR #334
  -- 1R0Uさんレビュー指摘）が本人判定に使う。
  owner_id text,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;
