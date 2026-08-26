import assert from "node:assert/strict";
import test from "node:test";
import { shouldEnableMockLogin } from "../lib/devEnvironment.ts";
import { authenticateAccount } from "../lib/mockLogin.ts";
import { resolveRootScreen } from "../lib/rootScreen.ts";

const accounts = [
  { email: "parent@mock.test", password: "parent-pass", user: { role: "parent" } },
  { email: "child@mock.test", password: "child-pass", user: { role: "child" } },
];

test("正しい資格情報から対応するモックユーザーを返す", () => {
  assert.equal(authenticateAccount(accounts, "parent@mock.test", "parent-pass")?.role, "parent");
  assert.equal(authenticateAccount(accounts, " CHILD@MOCK.TEST ", "child-pass")?.role, "child");
});

test("不明な資格情報ではログインできない", () => {
  assert.equal(authenticateAccount(accounts, "unknown@mock.test", "pass"), null);
  assert.equal(authenticateAccount(accounts, "parent@mock.test", "wrong"), null);
});

test("未ログイン時は開発環境だけログイン画面へ進む", () => {
  assert.equal(resolveRootScreen(undefined, true), "login");
  assert.equal(resolveRootScreen(undefined, false), "landing");
  assert.equal(resolveRootScreen("parent", true), "parent");
  assert.equal(resolveRootScreen("child", true), "child");
});

test("モックログインは開発・テスト環境に限定し、ロール指定を優先する", () => {
  assert.equal(shouldEnableMockLogin(true, undefined, undefined), true);
  assert.equal(shouldEnableMockLogin(false, "test", undefined), true);
  assert.equal(shouldEnableMockLogin(false, "production", undefined), false);
  assert.equal(shouldEnableMockLogin(true, "test", "parent"), false);
  assert.equal(shouldEnableMockLogin(true, "test", "child"), false);
});
