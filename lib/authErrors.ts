type AuthErrorLike = {
  code?: string;
  message?: string;
};

export const SIGN_UP_CONFIRMATION_MESSAGE =
  "確認メールが届いた場合は、リンクを開いてからログインしてください。";

/** 登録済みメールを示すAuthエラーかを、コードと旧メッセージ形式の両方で判定する。 */
export function isAlreadyRegisteredAuthError(error: AuthErrorLike | null): boolean {
  return (
    error?.code === "user_already_exists" ||
    (error?.message ?? "").includes("already registered")
  );
}

/** Supabase Auth のエラーを利用者向けの日本語へ変換する。 */
export function mapAuthError(error: AuthErrorLike | null): string {
  const code = error?.code;
  const message = error?.message ?? "";

  if (isAlreadyRegisteredAuthError(error)) {
    return SIGN_UP_CONFIRMATION_MESSAGE;
  }
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
