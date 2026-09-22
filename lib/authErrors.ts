type AuthErrorLike = {
  code?: string;
  message?: string;
};

/** Supabase Auth のエラーを利用者向けの日本語へ変換する。 */
export function mapAuthError(error: AuthErrorLike | null): string {
  const code = error?.code;
  const message = error?.message ?? "";

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "このメールアドレスは既に登録されています。";
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
