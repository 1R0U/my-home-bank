import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { shouldRedirectToLogin } from "../lib/authGuard.ts";

test("未ログインでログインが要る画面にいたら、ログイン画面へ送り返す", () => {
  assert.equal(shouldRedirectToLogin(["(adult)", "main-adult"], false, false, false), true);
  assert.equal(shouldRedirectToLogin(["(adult)", "settings"], false, false, false), true);
  assert.equal(shouldRedirectToLogin(["rpg-hub"], false, false, false), true);
  assert.equal(shouldRedirectToLogin(["bank"], false, false, false), true);
  assert.equal(shouldRedirectToLogin(["task-report"], false, false, false), true);
});

test("ログイン中は、どの画面でも送り返さない", () => {
  assert.equal(shouldRedirectToLogin(["(adult)", "main-adult"], true, false, false), false);
  assert.equal(shouldRedirectToLogin(["rpg-hub"], true, false, false), false);
  assert.equal(shouldRedirectToLogin(["login"], true, false, false), false);
});

test("ログイン画面と新規登録は、未ログインでも開ける", () => {
  assert.equal(shouldRedirectToLogin(["login"], false, false, false), false);
  assert.equal(shouldRedirectToLogin(["family-registration"], false, false, false), false);
});

test("ルートの / は index.tsx が自分で振り分けるので対象にしない", () => {
  assert.equal(shouldRedirectToLogin([], false, false, false), false);
});

test("Expo Router が用意する画面（+not-found など）は対象にしない", () => {
  assert.equal(shouldRedirectToLogin(["+not-found"], false, false, false), false);
});

test("開発用ロール指定のプレビュー中は、未ログインでも送り返さない", () => {
  assert.equal(shouldRedirectToLogin(["(adult)", "main-adult"], false, true, false), false);
  assert.equal(shouldRedirectToLogin(["rpg-hub"], false, true, false), false);
});

test("character-previewは、開発ビルドかつ未ログインのときだけ開ける", () => {
  assert.equal(shouldRedirectToLogin(["character-preview"], false, false, true), false);
  assert.equal(shouldRedirectToLogin(["character-preview"], false, false, false), true);
});

test("ログイン中はcharacter-previewの送り返しに影響しない（元から送り返さない）", () => {
  assert.equal(shouldRedirectToLogin(["character-preview"], true, false, false), false);
});

test("ログイン不要として許可している画面は、実在するファイルである", () => {
  // 名前を打ち間違えると、その画面が未ログインで開けなくなる（ログイン画面へ送り返され続ける）
  for (const route of ["login", "family-registration", "character-preview"]) {
    assert.ok(fs.existsSync(path.resolve(`app/${route}.tsx`)), `app/${route}.tsx がある`);
  }
});
