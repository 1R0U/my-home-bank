import { create } from "zustand";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";

type User = {
  id: string;
  name: string;
  role: "parent" | "child";
  balance: number;
};

type AppStore = {
  user: User | null;
  setUser: (user: User | null) => void;
};

// We'll build the store below; export `useAppStore` as the extended store for
// backward compatibility with components expecting onboarding helpers.

/** 画面分岐に使う実効ロール。開発用の DEV_ROLE_OVERRIDE があればそちらを優先する。 */
export function useActiveRole(): "parent" | "child" | undefined {
  const role = useAppStore((s) => s.user?.role);
  return DEV_ROLE_OVERRIDE ?? role;
}

// Onboarding store helpers (kept minimal for app flow/tests)
type OnboardingProfile = {
  name: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  familyRole?: "father" | "mother" | "child";
  gender?: "male" | "female" | "unspecified";
};

type ExtendedAppStore = AppStore & {
  onboardingProfile: OnboardingProfile;
  updateOnboardingProfile: (patch: Partial<OnboardingProfile>) => void;
};

// Replace store with extended store if not already
export const useAppStoreExtended = create<ExtendedAppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  onboardingProfile: { name: "", birthYear: "", birthMonth: "", birthDay: "" },
  updateOnboardingProfile: (patch) =>
    set((state: any) => ({ onboardingProfile: { ...(state.onboardingProfile || {}), ...patch } })),
}));

// Export primary hook name `useAppStore` expected across the codebase
export const useAppStore = useAppStoreExtended;
export const useAppStoreCompat = useAppStoreExtended;
