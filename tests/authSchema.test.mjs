import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "supabase/migrations/20260922000000_create_auth_user_profile.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const googleMigrationPath = path.resolve(
  "supabase/migrations/20260925010000_support_google_auth_profile.sql",
);
const googleSql = fs.readFileSync(googleMigrationPath, "utf8");
const verificationSql = fs.readFileSync(
  path.resolve("tests/sql/verify_remote_schema.sql"),
  "utf8",
);

test("Auth利用者の作成トリガーがusersプロフィールを同じIDで作る", () => {
  assert.match(sql, /create or replace function public\.create_user_profile_for_auth_user\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /insert into public\.users \(id, name, role, balance\)/i);
  assert.match(sql, /values \(new\.id, v_name, v_role, 0\)/i);
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /execute function public\.create_user_profile_for_auth_user\(\)/i);
});

test("Authメタデータの名前と役割をDB側でも検証する", () => {
  assert.match(sql, /new\.raw_user_meta_data ->> 'name'/i);
  assert.match(sql, /new\.raw_user_meta_data ->> 'role'/i);
  assert.match(sql, /v_name is null or v_name = ''/i);
  assert.match(sql, /char_length\(v_name\) > 50/i);
  assert.match(sql, /v_role is distinct from 'parent'/i);
});

test("公開登録の制約とDashboard・OAuthへの影響を運用コメントに残す", () => {
  assert.match(sql, /公開登録は「新しい家族を作る親」専用/);
  assert.match(sql, /raw_user_meta_data/);
  assert.match(sql, /Supabase Dashboard/);
  assert.match(sql, /OAuth/);
});

test("usersは本人と同じ家族を参照でき、更新可能列を名前と通知設定に限定する", () => {
  assert.match(sql, /alter table public\.users enable row level security/i);
  assert.match(
    sql,
    /create policy users_select_family[\s\S]*auth\.uid\(\) = id[\s\S]*family_id = public\.current_user_family_id\(\)/i,
  );
  assert.match(
    sql,
    /create policy users_update_self[\s\S]*using \(auth\.uid\(\) = id\)[\s\S]*with check \(auth\.uid\(\) = id\)/i,
  );
  assert.match(sql, /revoke all on table public\.users from anon/i);
  assert.match(sql, /revoke insert, delete, update on table public\.users from authenticated/i);
  assert.match(sql, /grant select on table public\.users to authenticated/i);
  assert.match(sql, /grant update \(name, notifications_enabled\) on table public\.users to authenticated/i);
  assert.match(verificationSql, /'users_select_family'/i);
  assert.match(verificationSql, /'users_update_self'/i);
});

test("プロフィール作成関数はクライアントから直接実行できない", () => {
  assert.match(
    sql,
    /revoke all on function public\.create_user_profile_for_auth_user\(\) from public, anon, authenticated/i,
  );
});

test("リモート検証はプロフィール作成トリガーをauth.usersに限定する", () => {
  assert.match(verificationSql, /from pg_catalog\.pg_trigger t/i);
  assert.match(verificationSql, /join pg_catalog\.pg_class c on c\.oid = t\.tgrelid/i);
  assert.match(verificationSql, /join pg_catalog\.pg_namespace n on n\.oid = c\.relnamespace/i);
  assert.match(verificationSql, /n\.nspname = 'auth'/i);
  assert.match(verificationSql, /c\.relname = 'users'/i);
});

test("Google認証は改ざんできないapp metadataのproviderで判定する", () => {
  assert.match(googleSql, /new\.raw_app_meta_data ->> 'provider'/i);
  assert.match(googleSql, /v_provider = 'google'/i);
  assert.doesNotMatch(googleSql, /raw_user_meta_data ->> 'provider'/i);
});

test("Google認証の表示名またはメール名を使い、役割はDB側でparentに固定する", () => {
  assert.match(googleSql, /raw_user_meta_data ->> 'name'/i);
  assert.match(googleSql, /raw_user_meta_data ->> 'full_name'/i);
  assert.match(googleSql, /split_part\(new\.email, '@', 1\)/i);
  assert.match(googleSql, /btrim\(left\([\s\S]*50\s*\)\)/i);
  assert.match(googleSql, /if v_is_google then[\s\S]*v_role := 'parent'/i);
  assert.match(googleSql, /insert into public\.users \(id, name, role, balance\)/i);
});

test("Google対応後もメール登録のnameとparent制約を維持する", () => {
  assert.match(
    googleSql,
    /else[\s\S]*raw_user_meta_data ->> 'name'[\s\S]*raw_user_meta_data ->> 'role'/i,
  );
  assert.match(googleSql, /v_role is distinct from 'parent'/i);
});

test("リモート検証はプロフィール作成関数がGoogle対応版か確認する", () => {
  assert.match(verificationSql, /create_user_profile_for_auth_user がGoogle OAuth対応版か/);
  assert.match(verificationSql, /raw_app_meta_data/i);
  assert.match(verificationSql, /full_name/i);
  assert.match(verificationSql, /split_part%new\.email/i);
});
