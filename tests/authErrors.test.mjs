import assert from "node:assert/strict";
import test from "node:test";
import {
  isAlreadyRegisteredAuthError,
  mapAuthError,
  SIGN_UP_CONFIRMATION_MESSAGE,
} from "../lib/authErrors.ts";

test("Supabase Authのエラーコードを日本語へ変換する", () => {
  assert.equal(
    mapAuthError({ code: "user_already_exists" }),
    SIGN_UP_CONFIRMATION_MESSAGE,
  );
  assert.equal(
    mapAuthError({ code: "invalid_credentials" }),
    "メールアドレスまたはパスワードが違います。",
  );
  assert.equal(
    mapAuthError({ code: "email_not_confirmed" }),
    "メールアドレスが確認されていません。届いたメールをご確認ください。",
  );
  assert.equal(
    mapAuthError({ code: "weak_password" }),
    "パスワードの強度が不足しています。別のパスワードを入力してください。",
  );
});

test("登録済みメールを示す新旧のAuthエラー形式を判定する", () => {
  assert.equal(isAlreadyRegisteredAuthError({ code: "user_already_exists" }), true);
  assert.equal(
    isAlreadyRegisteredAuthError({ message: "User already registered" }),
    true,
  );
  assert.equal(isAlreadyRegisteredAuthError({ code: "invalid_credentials" }), false);
});

test("古いメッセージ形式と未知のエラーにも表示文言を返す", () => {
  assert.equal(
    mapAuthError({ message: "Invalid login credentials" }),
    "メールアドレスまたはパスワードが違います。",
  );
  assert.equal(
    mapAuthError(null),
    "認証に失敗しました。時間をおいて再度お試しください。",
  );
});
