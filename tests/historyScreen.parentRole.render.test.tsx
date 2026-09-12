import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));

import HistoryScreen from "../components/HistoryScreen";

test("大人が履歴画面を開いたときは戻るボタンを表示しない（大人用タブのルート画面のため）", () => {
  render(<HistoryScreen />);

  expect(screen.queryByLabelText("前の画面に戻る")).toBeNull();
});
