type AuthErrorLike = {
  code?: string;
  message?: string;
};

export const SIGN_UP_CONFIRMATION_MESSAGE =
  "確認メールが届いた場合は、リンクを開いてからログインしてください。";

/**
 * 登録済みのメールアドレスで新規登録しようとしたときに出す案内（Issue #324）。
 *
 * 以前は登録済みかどうかを画面の応答から判別できないよう、確認待ちと同じ結果に
 * すり替えていた（メールアドレス列挙攻撃対策）。このアプリは家族単位の非公開
 * アプリで対策の必要性は低いと判断し、エラーとして知らせる方針に変えた。
 *
 * **新規登録専用。** `mapAuthError` には持ち込まない（1R0Uレビュー対応）。
 * `mapAuthError` は `signInWithEmail` / `signInWithGoogle` からも呼ばれており、
 * ログイン画面でこの案内が出ると意味が通らない。判定は `lib/auth.ts` の
 * `signUpWithEmail` が個別に行う。
 *
 * Googleでのみ登録した利用者が同じメールでメール登録を試した場合も、Supabaseの
 * 応答からは見分けられず同じ案内になる。その人にはパスワードが無いため、
 * 両方の入り口を案内する。
 */
export const ALREADY_REGISTERED_MESSAGE =
  "このメールアドレスは既に登録されています。ログイン画面からログインしてください" +
  "（Googleで登録した場合は、ログイン画面の「Googleでログイン」からログインしてください）。";

/** 登録済みメールを示すAuthエラーかを、コードと旧メッセージ形式の両方で判定する。 */
export function isAlreadyRegisteredAuthError(error: AuthErrorLike | null): boolean {
  return (
    error?.code === "user_already_exists" ||
    (error?.message ?? "").includes("already registered")
  );
}

/**
 * Supabase Auth のエラーを利用者向けの日本語へ変換する。
 *
 * **登録済みメール（`isAlreadyRegisteredAuthError`）はここでは扱わない
 * （1R0Uレビュー対応）。** ここは `signInWithEmail` / `signInWithGoogle` からも
 * 呼ばれる共通の変換で、新規登録専用の案内（`ALREADY_REGISTERED_MESSAGE`）を返すと
 * ログイン画面などで意味が通らなくなる。新規登録側の判定は `lib/auth.ts` の
 * `signUpWithEmail` が個別に行う。
 */
export function mapAuthError(error: AuthErrorLike | null): string {
  const code = error?.code;
  const message = error?.message ?? "";

  if (code === "invalid_credentials" || message.includes("Invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (code === "email_not_confirmed" || message.includes("Email not confirmed")) {
    return "メールアドレスが確認されていません。届いたメールをご確認ください。";
  }
  if (code === "weak_password") {
    return "パスワードの強度が不足しています。別のパスワードを入力してください。";
  }

  return "認証に失敗しました。時間をおいて再度お試しください。";
}
export const SESSION_REVOKED_MESSAGE = "別の端末でログインしました。親から新しいコードをもらってください。";

