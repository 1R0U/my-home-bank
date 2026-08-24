import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmailError,
  getNameError,
  getNewPasswordError,
  getRequiredError,
  MIN_PASSWORD_LENGTH,
} from "../lib/validation.ts";

test("getRequiredError は未入力・空白のみを未入力とみなす", () => {
  assert.equal(getRequiredError("", "名前"), "名前を入力してください。");
  assert.equal(getRequiredError("   ", "名前"), "名前を入力してください。");
  assert.equal(getRequiredError("たろう", "名前"), null);
});

test("getNameError は空欄のみエラーにする", () => {
  assert.equal(getNameError(""), "名前を入力してください。");
  assert.equal(getNameError("やまだ"), null);
});

test("getEmailError は未入力と形式不正を検出する", () => {
  assert.equal(getEmailError(""), "メールアドレスを入力してください。");
  assert.equal(getEmailError("invalid-email"), "メールアドレスの形式が正しくありません。");
  assert.equal(getEmailError("test@example.com"), null);
});

test("getNewPasswordError は未入力と最低文字数を検出する", () => {
  assert.equal(getNewPasswordError(""), "パスワードを入力してください。");
  assert.equal(
    getNewPasswordError("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`,
  );
  assert.equal(getNewPasswordError("a".repeat(MIN_PASSWORD_LENGTH)), null);
});
