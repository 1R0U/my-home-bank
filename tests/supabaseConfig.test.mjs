import assert from "node:assert/strict";
import test from "node:test";
import { resolveSupabaseConfig } from "../lib/supabaseConfig.ts";

const url = "https://example.supabase.co";
const anonKey = "sb_publishable_valid-test-key";

test("入力済みのSupabase設定を返す", () => {
  assert.deepEqual(resolveSupabaseConfig(url, anonKey), { url, anonKey });
});

test("URLが例示値のままなら初期化を拒否する", () => {
  assert.throws(
    () => resolveSupabaseConfig("https://your-project-id.supabase.co", anonKey),
    /実際のプロジェクトの値/,
  );
});

test("公開キーが例示値のままなら初期化を拒否する", () => {
  assert.throws(() => resolveSupabaseConfig(url, "your-anon-key-here"), /実際のプロジェクトの値/);
});

test("接続設定が不足していれば初期化を拒否する", () => {
  assert.throws(() => resolveSupabaseConfig(undefined, anonKey), /env vars are missing/);
  assert.throws(() => resolveSupabaseConfig(url, undefined), /env vars are missing/);
});
