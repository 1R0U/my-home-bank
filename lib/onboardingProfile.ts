import type { OnboardingProfile } from "../types";

/** オンボーディング画面で使用するプロフィールの初期値 */
export const INITIAL_ONBOARDING_PROFILE: OnboardingProfile = {
  name: "",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
};

/**
 * オンボーディングプロフィールを部分的に更新する。
 * @param profile - 現在のプロフィール
 * @param update - 更新する項目（一部のみ指定可能）
 * @returns 更新後のプロフィール
 */
export function updateOnboardingProfile(
  profile: OnboardingProfile,
  update: Partial<OnboardingProfile>,
): OnboardingProfile {
  return { ...profile, ...update };
}
