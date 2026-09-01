export type LoginAccount<T> = {
  email: string;
  password: string;
  user: T;
};

/**
 * アカウント一覧から、メールアドレスとパスワードで認証を行う（汎用的なモックログイン用関数）。
 * @param accounts - 認証対象のアカウント一覧
 * @param email - 入力されたメールアドレス（大文字小文字を無視して照合）
 * @param password - 入力されたパスワード
 * @returns 認証に成功した場合は該当ユーザー。失敗した場合は null
 */
export function authenticateAccount<T>(
  accounts: ReadonlyArray<LoginAccount<T>>,
  email: string,
  password: string,
): T | null {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    accounts.find(
      (account) =>
        account.email.toLowerCase() === normalizedEmail &&
        account.password === password,
    )?.user ?? null
  );
}
