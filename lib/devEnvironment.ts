import type { UserRole } from "../types";

export function shouldEnableMockLogin(
  isDev: boolean,
  variant: string | undefined,
  roleOverride: UserRole | undefined,
): boolean {
  return roleOverride === undefined && (isDev || variant === "test");
}
