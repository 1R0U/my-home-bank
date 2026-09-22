import type { UserRole } from "../types";

export type RootScreen = UserRole | "login";

/**
 * ルート画面（アプリ起動時の初期画面）を決定する。
 * @param role - ログイン中のユーザーロール（未ログインの場合は undefined）
 * @returns ログイン済みならそのロール、未ログインなら login
 */
export function resolveRootScreen(role: UserRole | undefined): RootScreen {
  if (role) return role;
  return "login";
}
