import type { UserRole } from "../types";

/**
 * モックログインを有効にすべきかを判定する。
 * ロール固定起動時（roleOverride が指定されている場合）は無効、
 * 開発モードまたはテストビルドの場合は有効。
 * @param isDev - 開発モードかどうか（__DEV__）
 * @param variant - ビルドバリアント（EXPO_PUBLIC_APP_VARIANT）
 * @param roleOverride - ロール固定起動の指定
 * @returns モックログインを有効にする場合は true
 */
export function shouldEnableMockLogin(
  isDev: boolean,
  variant: string | undefined,
  roleOverride: UserRole | undefined,
): boolean {
  return roleOverride === undefined && (isDev || variant === "test");
}
