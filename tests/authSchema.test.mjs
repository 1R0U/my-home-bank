import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "supabase/migrations/20260922000000_create_auth_user_profile.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
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
  assert.match(sql, /v_role is null or v_role not in \('parent', 'child'\)/i);
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
