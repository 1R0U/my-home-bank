import { create } from "zustand";
import { getMockCurrentUser } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { getGuestUser } from "../lib/guestUsers";
import { isUuid } from "../lib/uuid";
import {
  createInitialSettingsByRole,
  updateSettingsByRole,
  type SettingsRole,
  type SettingsState,
} from "../lib/settings";
import type { User, UserRole } from "../types";

type AppStore = {
  user: User | null;
  setUser: (user: User | null) => void;
  // 親・子でそれぞれ別のユーザーとして扱うため、設定もロールごとに持つ
  settings: Record<SettingsRole, SettingsState>;
  updateSettings: (role: SettingsRole, patch: Partial<SettingsState>) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
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
 * 画面プレビュー用のゲストユーザーを返す（Issue #211）。ゲストの行はDBにも存在するが、
 * Authセッションがない開発プレビューからはRLSで実データへアクセスさせない。
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
   * Supabase Authでログイン中で、かつIDがUUID形式のとき true。モックアカウントで入ると
   * IDが `user-child-1` のような非UUIDになり、`users.id` は uuid 型なので
   * そのIDを使う問い合わせは必ず失敗する。呼ばずにモック値へ任せる（#174）。
   *
   * **利用者のIDを使う取得・書き込みは、すべてこれで判定する。**
   */
  canUseRealData: boolean;
  /**
   * ログインしているか。
   *
   * Supabase Authでログインしているか。利用者IDを使わない取得も、RLSの前提となる
   * Authセッションがある場合だけこちらを使って実行する。
   */
  isLoggedIn: boolean;
};

/**
 * 実データを扱ってよいかを返す。
 * @returns ログイン状態と、実データを使ってよいかの判定
 */
export function useDataAccess(): DataAccess {
  const currentUser = useCurrentUser();
  const authenticatedUser = useAppStore((state) => state.user);
  const canUseAuthenticatedData = DEV_ROLE_OVERRIDE === undefined && authenticatedUser !== null;
  return {
    canUseRealData: canUseAuthenticatedData && isUuid(authenticatedUser.id),
    isLoggedIn: canUseAuthenticatedData && currentUser !== null,
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
