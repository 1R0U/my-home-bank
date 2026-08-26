import assert from "node:assert/strict";
import test from "node:test";
import { canSubmitLogin } from "../lib/loginForm.ts";

test("メールアドレス・パスワードがともに空なら送信できない", () => {
  assert.equal(canSubmitLogin("", ""), false);
});

test("どちらか一方だけ入力されていても送信できない", () => {
  assert.equal(canSubmitLogin("test@example.com", ""), false);
  assert.equal(canSubmitLogin("", "password123"), false);
});

test("空白のみの入力は未入力とみなす", () => {
  assert.equal(canSubmitLogin("   ", "   "), false);
});

test("両方入力されていれば送信できる", () => {
  assert.equal(canSubmitLogin("test@example.com", "password123"), true);
});
