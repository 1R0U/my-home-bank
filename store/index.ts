import { create } from "zustand";
import { getMockCurrentUser } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { getGuestUser } from "../lib/guestUsers";
import { isUuid } from "../lib/uuid";
import { INITIAL_ONBOARDING_PROFILE, updateOnboardingProfile } from "../lib/onboardingProfile";
import {
  createInitialSettingsByRole,
  updateSettingsByRole,
  type SettingsRole,
  type SettingsState,
} from "../lib/settings";
import type { OnboardingProfile, User, UserRole } from "../types";

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
 * ログイン中ユーザー。
 *
 * 開発用ロール指定（`npm run start:parent` / `start:child`）のときは、
 * Supabase に seed 済みのゲストユーザーを返す（Issue #211）。
 * 以前はモックユーザーを返しており、IDが非UUIDだったため実データを一切扱えなかった。
 * ゲストは実在する行なので、そのままクエスト追加・購入・預入などの書き込みが通る。
 * @returns ログイン中のユーザー。未ログインの場合は null
 */
export function useCurrentUser(): User | null {
  const user = useAppStore((state) => state.user);

  if (DEV_ROLE_OVERRIDE) {
    return getGuestUser(DEV_ROLE_OVERRIDE);
  }

  return user;
}

/**
 * 実データを扱ってよいかの判定（Issue #217）。
 *
 * **2つの意味を分けて持つ。** 以前はどちらも `isLive` という1つの名前で呼ばれており、
 * 画面によって指すものが違った。その結果 `isUuid` のガードが画面ごとの手書きになり、
 * 抜けた画面で書き込みが黙って失敗していた（#174 / #206 で4箇所に後から追加）。
 */
export type DataAccess = {
  /**
   * 実データを読み書きしてよいか。
   *
   * ログイン中で、かつIDがUUID形式のとき true。ログイン画面のモックアカウントで入ると
   * IDが `user-child-1` のような非UUIDになり、`users.id` は uuid 型なので
   * そのIDを使う問い合わせは必ず失敗する。呼ばずにモック値へ任せる（#174）。
   *
   * **利用者のIDを使う取得・書き込みは、すべてこれで判定する。**
   */
  canUseRealData: boolean;
  /**
   * ログインしているか。
   *
   * 利用者のIDを使わない取得（クエスト一覧の全件取得など）は、IDの形式に関係なく
   * 成功するため、こちらで判定する。
   */
  isLoggedIn: boolean;
};

/**
 * 実データを扱ってよいかを返す。
 * @returns ログイン状態と、実データを使ってよいかの判定
 */
export function useDataAccess(): DataAccess {
  const currentUser = useCurrentUser();
  return {
    canUseRealData: currentUser !== null && isUuid(currentUser.id),
    isLoggedIn: currentUser !== null,
  };
}

/**
 * 画面に出す利用者。未ログインのときはモックの利用者へフォールバックする（Issue #217）。
 *
 * フォールバックした利用者のIDは非UUIDなので `canUseRealData` が false になり、
 * 実データの読み書きには使われない。表示を空にしないためだけのもの。
 * @param fallbackRole - 未ログイン時に使うモック利用者のロール
 * @returns ログイン中の利用者、または対応するモック利用者
 */
export function useDisplayUser(fallbackRole: UserRole): User {
  const currentUser = useCurrentUser();
  return currentUser ?? getMockCurrentUser(fallbackRole);
}
