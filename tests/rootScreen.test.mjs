import assert from "node:assert/strict";
import test from "node:test";
import { resolveRootScreen } from "../lib/rootScreen.ts";

// tests/mockLogin.test.mjs から移した（Issue #275 でモックログインの部品を消したため）
// Issue #286 で未ログイン時の行き先をログイン画面からタイトル画面へ変えた
test("未ログイン時は実行環境にかかわらずタイトル画面へ進む", () => {
  assert.equal(resolveRootScreen(undefined), "title");
  assert.equal(resolveRootScreen("parent"), "parent");
  assert.equal(resolveRootScreen("child"), "child");
});

test("ログイン済みならタイトル画面を経由しない", () => {
  assert.notEqual(resolveRootScreen("parent"), "title");
  assert.notEqual(resolveRootScreen("child"), "title");
});
