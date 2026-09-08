/**
 * ログインフォームの送信可否を判定する。
 * @param email - メールアドレス
 * @param password - パスワード
 * @returns 両方とも空でない場合は true
 */
export function canSubmitLogin(email: string, password: string): boolean {
  return email.trim().length > 0 && password.trim().length > 0;
}
