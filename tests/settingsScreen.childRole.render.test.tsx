import { act, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));
// 設定サービスが誤って実クライアントへ接続してもテストを外部環境に依存させない。
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import SettingsScreen from "../components/SettingsScreen";

test("子供が設定画面を開いたときは戻るボタンを表示する", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});
