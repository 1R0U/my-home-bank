import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GUEST_USERS, getGuestUser } from "../lib/guestUsers.ts";
import { isUuid } from "../lib/uuid.ts";

const MIGRATION_PATH = "supabase/migrations/20260915000000_seed_guest_users.sql";
const migrationSql = readFileSync(new URL(`../${MIGRATION_PATH}`, import.meta.url), "utf8");

test("ゲストのIDはUUID形式", () => {
  // 非UUIDだと isUuid のガードに弾かれ、実DBを一切読み書きできないモックユーザーに逆戻りする
  for (const [role, user] of Object.entries(GUEST_USERS)) {
    assert.ok(isUuid(user.id), `${role} のIDがUUID形式でない: ${user.id}`);
  }
});

test("ロールのキーと中身の role が一致する", () => {
  for (const [role, user] of Object.entries(GUEST_USERS)) {
    assert.equal(user.role, role);
  }
});

test("大人と子供で別のIDになっている", () => {
  // 同じIDだと role の意味が起動のたびにひっくり返る（承認フローの確認ができない）
  assert.notEqual(GUEST_USERS.parent.id, GUEST_USERS.child.id);
});

test("getGuestUser がロールに対応するユーザーを返す", () => {
  assert.equal(getGuestUser("parent"), GUEST_USERS.parent);
  assert.equal(getGuestUser("child"), GUEST_USERS.child);
});

// --- マイグレーションとの突き合わせ ---
// 定数とSQLのどちらかだけを書き換えると、存在しないユーザーとしてログインした状態になり、
// 取得が全て空になる。原因が分かりにくいので、ここでずれを検出する。

test("定数のIDがマイグレーションに含まれている", () => {
  for (const [role, user] of Object.entries(GUEST_USERS)) {
    assert.ok(
      migrationSql.includes(`'${user.id}'`),
      `${role} のID ${user.id} が ${MIGRATION_PATH} に見当たらない`,
    );
  }
});

test("マイグレーションが users へ入れているIDが、定数と過不足なく一致する", () => {
  // insert into public.users ... values (...) の中のUUIDだけを拾う
  const valuesBlock = migrationSql.slice(
    migrationSql.indexOf("insert into public.users"),
    migrationSql.indexOf("on conflict (id) do nothing;"),
  );
  const seededIds = [...valuesBlock.matchAll(/'([0-9a-f-]{36})'/gi)].map((match) => match[1]);

  assert.deepEqual(
    [...seededIds].sort(),
    Object.values(GUEST_USERS)
      .map((user) => user.id)
      .sort(),
  );
});

test("マイグレーションのロールが定数と一致する", () => {
  const lines = migrationSql.split("\n");
  for (const user of Object.values(GUEST_USERS)) {
    const line = lines.find((candidate) => candidate.includes(`'${user.id}',`));
    assert.ok(line, `${user.id} を values に並べた行が見つからない`);
    assert.ok(
      line.includes(`'${user.role}'`),
      `${user.id} のロールがSQLと一致しない（期待: ${user.role}）: ${line.trim()}`,
    );
  }
});

test("マイグレーションがゲストの銀行口座も作る", () => {
  // bank_accounts の行がないと、預入/引き出しRPCの update が0行に当たり、
  // お財布だけ減って預金が増えない（RPC側は行の有無を見ていない）
  assert.ok(
    migrationSql.includes("insert into public.bank_accounts"),
    "bank_accounts への insert が見当たらない",
  );
});
