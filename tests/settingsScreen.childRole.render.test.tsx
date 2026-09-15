import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));

import SettingsScreen from "../components/SettingsScreen";

test("子供が設定画面を開いたときは戻るボタンを表示する", () => {
  render(<SettingsScreen />);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});
