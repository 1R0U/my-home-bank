import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import TutorialHarness from "./helpers/TutorialHarness";

const mockStartTutorial = jest.fn();
jest.mock("../components/tutorial/TutorialContext", () => {
  const actual = jest.requireActual<typeof import("../components/tutorial/TutorialContext")>("../components/tutorial/TutorialContext");
  return { ...actual, useTutorial: () => actual.useTutorial() ?? { start: mockStartTutorial } };
});

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canDismiss: () => true, dismissTo: jest.fn() },
}));
// 設定サービスが誤って実クライアントへ接続してもテストを外部環境に依存させない。
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import SettingsScreen from "../components/SettingsScreen";

test("大人が設定画面を開いたときも戻るボタンを表示する（ホーム画面からrouter.pushで開く画面のため、Issue #320）", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});

test("設定の見直しボタンは大人の案内を開始してホームへ移る", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  expect(mockStartTutorial).toHaveBeenCalledTimes(1);
  expect(router.dismissTo).toHaveBeenCalledWith("/main-adult");
});

test("大人の案内は家族・その他・クレジットを開き、プロフィールや通知を変えない", async () => {
  render(<TutorialHarness initialStep="parent-settings-family"><SettingsScreen /></TutorialHarness>);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "家族の子供" }));
  expect(screen.getByLabelText("追加する子供の名前")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "その他" }));
  expect(screen.getByText("アプリについて")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "音楽クレジット" }));
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-settings-summary");
});
