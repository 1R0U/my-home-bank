import { create } from "zustand";
import { getMockCurrentUser } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { INITIAL_ONBOARDING_PROFILE, updateOnboardingProfile } from "../lib/onboardingProfile";
import {
  createInitialSettingsByRole,
  updateSettingsByRole,
  type SettingsRole,
  type SettingsState,
} from "../lib/settings";
import type { OnboardingProfile, User } from "../types";

type AppStore = {
  user: User | null;
  setUser: (user: User | null) => void;
  onboardingProfile: OnboardingProfile;
  updateOnboardingProfile: (profile: Partial<OnboardingProfile>) => void;
  // 親・子でそれぞれ別のユーザーとして扱うため、設定もロールごとに持つ
  settings: Record<SettingsRole, SettingsState>;
  updateSettings: (role: SettingsRole, patch: Partial<SettingsState>) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  onboardingProfile: INITIAL_ONBOARDING_PROFILE,
  updateOnboardingProfile: (profile) =>
    set((state) => ({
      onboardingProfile: updateOnboardingProfile(state.onboardingProfile, profile),
    })),
  settings: createInitialSettingsByRole(getMockCurrentUser("parent").name, getMockCurrentUser("child").name),
  updateSettings: (role, patch) =>
    set((state) => ({
      settings: updateSettingsByRole(state.settings, role, patch),
    })),
}));

/**
 * 画面分岐に使う実効ロール。開発用の DEV_ROLE_OVERRIDE があればそちらを優先する。
 * @returns 実効ロール（親または子）。未ログインの場合は undefined
 */
export function useActiveRole(): SettingsRole | undefined {
  const role = useAppStore((s) => s.user?.role);
  return DEV_ROLE_OVERRIDE ?? role;
}

/**
 * ログイン中ユーザー。開発用ロール指定時は対応するモックユーザーを返す。
 * @returns ログイン中のユーザー。未ログインの場合は null
 */
export function useCurrentUser(): User | null {
  const user = useAppStore((state) => state.user);

  if (DEV_ROLE_OVERRIDE) {
    return getMockCurrentUser(DEV_ROLE_OVERRIDE);
  }

  return user;
}
