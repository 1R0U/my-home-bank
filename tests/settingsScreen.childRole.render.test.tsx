import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));

import SettingsScreen from "../components/SettingsScreen";

test("子供が設定画面を開いても大人用の下部メニューバーを表示しない", () => {
  render(<SettingsScreen />);

  expect(screen.queryByRole("button", { name: "ホーム" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ローン" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ストア" })).toBeNull();
});
