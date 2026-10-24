import { render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

/**
 * 家事をしなくていい日の画面で、子供の一覧とお休みの日が、同じ判定（canUseRealData）で
 * 実データを使うかを決めること（PR #420 のレビュー）。
 *
 * ほかの描画テストは家族の取得を差し替えているので、ここでは本物の
 * useFamilyMembers / useQuestRestDays を通し、通信だけを差し替える。
 */

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

const mockFetchFamilyUsers = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
jest.mock("../lib/storeService", () => ({
  fetchFamilyUsers: (...args: unknown[]) => mockFetchFamilyUsers(...args),
}));

const mockFetchQuestRestDays = jest.fn<(...args: unknown[]) => Promise<unknown[]>>(() => Promise.resolve([]));
jest.mock("../lib/questRestDayService", () => ({
  fetchQuestRestDays: (...args: unknown[]) => mockFetchQuestRestDays(...args),
  setQuestRestDays: jest.fn(),
}));

import RestDaysScreen from "../components/RestDaysScreen";
import { useAppStore } from "../store";

const baseUser = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "family-1",
  name: "お父さん",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchFamilyUsers.mockRejectedValue(new Error("取得してはいけない"));
});

test("ログイン済みでもUUIDでない利用者では、家族を問い合わせず、取得エラーも出さない", async () => {
  // ログイン画面のモックアカウント: isLoggedIn は真、canUseRealData は偽
  useAppStore.setState({ user: { ...baseUser, id: "user-parent-1" } });

  await render(<RestDaysScreen />);

  expect(await screen.findByText("※ プレビュー中は設定できません")).toBeTruthy();
  // 子供はモック（プレビュー）の家族から出る
  expect(screen.getByRole("checkbox", { name: "たろう" })).toBeTruthy();
  expect(mockFetchFamilyUsers).not.toHaveBeenCalled();
  expect(mockFetchQuestRestDays).not.toHaveBeenCalled();
  expect(screen.queryByText("家族の情報を取得できませんでした")).toBeNull();
});

test("実データを使える利用者では、家族とお休みの日をどちらも取得する", async () => {
  mockFetchFamilyUsers.mockResolvedValue([
    { id: "33333333-3333-4333-8333-333333333331", name: "お父さん", role: "parent" },
    { id: "33333333-3333-4333-8333-333333333332", name: "じろう", role: "child" },
  ]);
  useAppStore.setState({ user: { ...baseUser, id: "33333333-3333-4333-8333-333333333331" } });

  await render(<RestDaysScreen />);

  expect(await screen.findByRole("checkbox", { name: "じろう" })).toBeTruthy();
  await waitFor(() => expect(mockFetchQuestRestDays).toHaveBeenCalledTimes(1));
  expect(mockFetchFamilyUsers).toHaveBeenCalledWith("family-1");
  expect(screen.queryByText("※ プレビュー中は設定できません")).toBeNull();
});
