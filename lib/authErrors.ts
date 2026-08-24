export function mapAuthError(error: { message?: string } | null): string {
  const message = error?.message ?? "";

  if (message.includes("already registered")) {
    return "このメールアドレスは既に登録されています。";
  }
  if (message.includes("Invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (message.includes("Email not confirmed")) {
    return "メールアドレスが確認されていません。届いたメールをご確認ください。";
  }

  return "エラーが発生しました。時間をおいて再度お試しください。";
}
