import assert from "node:assert/strict";
import test from "node:test";
import { mapAuthError } from "../lib/authErrors.ts";

test("登録済みメールアドレスのエラーを日本語に変換する", () => {
  assert.equal(
    mapAuthError({ message: "User already registered" }),
    "このメールアドレスは既に登録されています。",
  );
});

test("認証情報不一致のエラーを日本語に変換する", () => {
  assert.equal(
    mapAuthError({ message: "Invalid login credentials" }),
    "メールアドレスまたはパスワードが違います。",
  );
});

test("メール未確認のエラーを日本語に変換する", () => {
  assert.equal(
    mapAuthError({ message: "Email not confirmed" }),
    "メールアドレスが確認されていません。届いたメールをご確認ください。",
  );
});

test("未知のエラーは汎用メッセージに変換する", () => {
  assert.equal(
    mapAuthError({ message: "network error" }),
    "エラーが発生しました。時間をおいて再度お試しください。",
  );
  assert.equal(mapAuthError(null), "エラーが発生しました。時間をおいて再度お試しください。");
});
