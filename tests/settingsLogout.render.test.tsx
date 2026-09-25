import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockReplace = jest.fn();
const mockSignOutCurrentUser = jest.fn<() => Promise<string | null>>();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) },
}));
jest.mock("../lib/auth", () => ({
  signOutCurrentUser: () => mockSignOutCurrentUser(),
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import SettingsScreen from "../components/SettingsScreen";
import { useAppStore } from "../store";

const authenticatedUser = {
  balance: 0,
  created_at: "2026-09-22T00:00:00Z",
  family_id: "10000000-0000-4000-8000-000000000024",
  id: "00000000-0000-4000-8000-000000000024",
  name: "山田 太郎",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOutCurrentUser.mockResolvedValue(null);
  useAppStore.setState({ user: authenticatedUser });
});

test("ログアウトに成功すると利用者を消してログイン画面へ戻る", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);

  await act(async () => {
    fireEvent.press(screen.getByText("ログアウト"));
  });

  expect(mockSignOutCurrentUser).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().user).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("ログアウトに失敗すると利用者を維持してエラーを表示する", async () => {
  mockSignOutCurrentUser.mockResolvedValue("ログアウトに失敗しました。");
  render(<SettingsScreen />);
  await act(async () => undefined);

  await act(async () => {
    fireEvent.press(screen.getByText("ログアウト"));
  });

  expect(screen.getByText("ログアウトに失敗しました。")).toBeTruthy();
  expect(useAppStore.getState().user).toEqual(authenticatedUser);
  expect(mockReplace).not.toHaveBeenCalled();
});
