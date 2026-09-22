import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmailError,
  getNameError,
  getNewPasswordError,
  getRequiredError,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../lib/validation.ts";

test("必須項目は空文字と空白だけの入力を拒否する", () => {
  assert.equal(getRequiredError("", "名前"), "名前を入力してください。");
  assert.equal(getRequiredError("   ", "名前"), "名前を入力してください。");
  assert.equal(getNameError("山田"), null);
  assert.equal(getNameError("あ".repeat(MAX_NAME_LENGTH)), null);
  assert.equal(
    getNameError("あ".repeat(MAX_NAME_LENGTH + 1)),
    `名前は${MAX_NAME_LENGTH}文字以内で入力してください。`,
  );
});

test("メールアドレスの未入力と形式不正を検出する", () => {
  assert.equal(getEmailError(""), "メールアドレスを入力してください。");
  assert.equal(getEmailError("invalid-email"), "メールアドレスの形式が正しくありません。");
  assert.equal(getEmailError(" user@example.com "), null);
});

test("新規登録用パスワードは8文字以上を要求する", () => {
  assert.equal(getNewPasswordError(""), "パスワードを入力してください。");
  assert.equal(
    getNewPasswordError("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`,
  );
  assert.equal(getNewPasswordError("a".repeat(MIN_PASSWORD_LENGTH)), null);
});
