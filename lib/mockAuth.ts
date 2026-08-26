import { MOCK_USERS } from "../constants/mockData";
import type { User, UserRole } from "../types";
import { authenticateAccount } from "./mockLogin";

export type MockAccount = {
  email: string;
  password: string;
  user: User;
};

function findMockUser(role: UserRole): User {
  const user = MOCK_USERS.find((candidate) => candidate.role === role);

  if (!user) {
    throw new Error(`モックユーザーが見つかりません: ${role}`);
  }

  return user;
}

/** 開発専用の資格情報。実在するメールアドレスやパスワードは使用しない。 */
export const MOCK_ACCOUNTS: Record<UserRole, MockAccount> = {
  parent: {
    email: "parent@mock.my-home-bank.test",
    password: "parent-mock-pass",
    user: findMockUser("parent"),
  },
  child: {
    email: "child@mock.my-home-bank.test",
    password: "child-mock-pass",
    user: findMockUser("child"),
  },
};

export function authenticateMockUser(
  email: string,
  password: string,
): User | null {
  return authenticateAccount(Object.values(MOCK_ACCOUNTS), email, password);
}
