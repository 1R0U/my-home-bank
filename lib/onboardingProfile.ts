import type { OnboardingProfile } from "../types";

export const INITIAL_ONBOARDING_PROFILE: OnboardingProfile = {
  name: "",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
};

export function updateOnboardingProfile(
  profile: OnboardingProfile,
  update: Partial<OnboardingProfile>,
): OnboardingProfile {
  return { ...profile, ...update };
}
