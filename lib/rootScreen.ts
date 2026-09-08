import type { UserRole } from "../types";

export type RootScreen = UserRole | "login" | "landing";

/**
 * ルート画面（アプリ起動時の初期画面）を決定する。
 * @param role - ログイン中のユーザーロール（未ログインの場合は undefined）
 * @param mockLoginEnabled - モックログインが有効かどうか
 * @returns ログイン済みならそのロール、未ログイン時はモックログインの有効/無効で login または landing
 */
export function resolveRootScreen(
  role: UserRole | undefined,
  mockLoginEnabled: boolean,
): RootScreen {
  if (role) return role;
  return mockLoginEnabled ? "login" : "landing";
}
