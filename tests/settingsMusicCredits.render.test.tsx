import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import ChildSettingsScreen from "../components/ChildSettingsScreen";
import ParentSettingsScreen from "../components/ParentSettingsScreen";
import { useAppStore } from "../store";
import { iconButtonName } from "./iconButtonName";

// Issue #393（1R0Uさんレビュー指摘）：CC BY 4.0の曲を同梱する以上、アプリ内に
// クレジット表示の仕組みが必要。設定画面の「音楽クレジット」から表示する。
// 大人用・子供用のどちらの設定画面にも出す（Issue #439）
// 開く人のロールは画面に合わせる（反対のロールだと別の画面へ移すため）
test.each([
  ["子供用", ChildSettingsScreen, "child" as const],
  ["大人用", ParentSettingsScreen, "parent" as const],
])("%s設定画面の「音楽クレジット」を開くと、CC BY 4.0の曲の出典が表示される", async (_label, Screen, role) => {
  useAppStore.setState({
    user: { balance: 0, created_at: "2026-07-01T00:00:00Z", id: `user-${role}-1`, name: "テスト", role },
  });
  await render(<Screen />);
  await act(async () => undefined);

  await fireEvent.press(screen.getByRole("button", { name: iconButtonName("音楽クレジット") }));

  expect(screen.getByText("Village_Fete")).toBeTruthy();
  expect(screen.getByText("Positive")).toBeTruthy();
  expect(screen.getByText("Laid_Back3")).toBeTruthy();
  expect(screen.getAllByText(/PeriTune/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/CC BY 4.0/).length).toBe(3);
});
