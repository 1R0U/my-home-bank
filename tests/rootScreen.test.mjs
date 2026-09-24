import assert from "node:assert/strict";
import test from "node:test";
import { resolveRootScreen } from "../lib/rootScreen.ts";

// tests/mockLogin.test.mjs から移した（Issue #275 でモックログインの部品を消したため）
test("未ログイン時は実行環境にかかわらずログイン画面へ進む", () => {
  assert.equal(resolveRootScreen(undefined), "login");
  assert.equal(resolveRootScreen("parent"), "parent");
  assert.equal(resolveRootScreen("child"), "child");
});
