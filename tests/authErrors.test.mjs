import assert from "node:assert/strict";
import test from "node:test";
import { mapAuthError } from "../lib/authErrors.ts";

test("Supabase Authのエラーコードを日本語へ変換する", () => {
  assert.equal(
    mapAuthError({ code: "user_already_exists" }),
    "このメールアドレスは既に登録されています。",
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
