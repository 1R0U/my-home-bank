import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import SettingsScreen from "../components/SettingsScreen";

// Issue #393（1R0Uさんレビュー指摘）：CC BY 4.0の曲を同梱する以上、アプリ内に
// クレジット表示の仕組みが必要。設定画面の「音楽クレジット」から表示する。
test("設定画面の「音楽クレジット」を開くと、CC BY 4.0の曲の出典が表示される", async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);

  fireEvent.press(screen.getByRole("button", { name: "音楽クレジット" }));

  expect(screen.getByText("Village_Fete")).toBeTruthy();
  expect(screen.getByText("Positive")).toBeTruthy();
  expect(screen.getByText("Laid_Back3")).toBeTruthy();
  expect(screen.getAllByText(/PeriTune/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/CC BY 4.0/).length).toBe(3);
});
