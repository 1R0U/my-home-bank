import { create } from "zustand";
import { MOCK_CURRENT_USER } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { INITIAL_ONBOARDING_PROFILE, updateOnboardingProfile } from "../lib/onboardingProfile";
import { createInitialSettings, updateSettings as applySettingsPatch, type SettingsState } from "../lib/settings";
import type { OnboardingProfile } from "../types";

type User = {
  id: string;
  name: string;
  role: "parent" | "child";
  balance: number;
};

type AppStore = {
  user: User | null;
  setUser: (user: User | null) => void;
  onboardingProfile: OnboardingProfile;
  updateOnboardingProfile: (profile: Partial<OnboardingProfile>) => void;
  settings: SettingsState;
  updateSettings: (patch: Partial<SettingsState>) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  onboardingProfile: INITIAL_ONBOARDING_PROFILE,
  updateOnboardingProfile: (profile) =>
    set((state) => ({
      onboardingProfile: updateOnboardingProfile(state.onboardingProfile, profile),
    })),
  settings: createInitialSettings(MOCK_CURRENT_USER.name),
  updateSettings: (patch) =>
    set((state) => ({
      settings: applySettingsPatch(state.settings, patch),
    })),
}));

/** 画面分岐に使う実効ロール。開発用の DEV_ROLE_OVERRIDE があればそちらを優先する。 */
export function useActiveRole(): "parent" | "child" | undefined {
  const role = useAppStore((s) => s.user?.role);
  return DEV_ROLE_OVERRIDE ?? role;
}
