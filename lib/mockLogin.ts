export type LoginAccount<T> = {
  email: string;
  password: string;
  user: T;
};

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
