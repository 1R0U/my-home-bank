import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";

const mockStartTutorial = jest.fn();
jest.mock("../components/tutorial/TutorialContext", () => ({
  useTutorial: () => ({ start: mockStartTutorial }),
}));

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canDismiss: () => true, dismissTo: jest.fn() },
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

test("設定の見直しで町を選ぶと子供の町の案内を開始する", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  fireEvent.press(screen.getByRole("button", { name: "町の案内を見る" }));
  expect(mockStartTutorial).toHaveBeenCalledTimes(1);
  expect(router.dismissTo).toHaveBeenCalledWith("/rpg-hub");
});
