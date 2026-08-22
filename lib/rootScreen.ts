import type { UserRole } from "../types";

export type RootScreen = UserRole | "login" | "landing";

export function resolveRootScreen(
  role: UserRole | undefined,
  mockLoginEnabled: boolean,
): RootScreen {
  if (role) return role;
  return mockLoginEnabled ? "login" : "landing";
}
