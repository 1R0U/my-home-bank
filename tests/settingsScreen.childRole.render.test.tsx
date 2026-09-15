import { act, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
// ゲストユーザー（Issue #211）はIDがUUIDなので、開発用ロール指定でも実データを取りに行く。
// 実クライアントを呼ばないようサービス層を差し替える
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import SettingsScreen from "../components/SettingsScreen";

test("子供が設定画面を開いても大人用の下部メニューバーを表示しない", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);

  expect(screen.queryByRole("button", { name: "ホーム" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ローン" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ストア" })).toBeNull();
});
