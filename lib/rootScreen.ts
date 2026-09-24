import type { UserRole } from "../types";

export type RootScreen = UserRole | "title";

/**
 * ルート画面（アプリ起動時の初期画面）を決定する。
 * @param role - ログイン中のユーザーロール（未ログインの場合は undefined）
 * @returns ログイン済みならそのロール、未ログインなら title（ログイン画面の前のタイトル画面／Issue #286）
 */
export function resolveRootScreen(role: UserRole | undefined): RootScreen {
  if (role) return role;
  return "title";
}
