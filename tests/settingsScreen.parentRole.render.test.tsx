import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));

import SettingsScreen from "../components/SettingsScreen";

test("大人が設定画面を開いたときは大人用の下部メニューバーを表示する", () => {
  render(<SettingsScreen />);

  expect(screen.getByRole("button", { name: "ホーム" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ローン" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ストア" })).toBeTruthy();
});
