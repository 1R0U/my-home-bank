import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));

import HistoryScreen from "../components/HistoryScreen";

test("子供が履歴画面を開いたときは戻るボタンを表示する", () => {
  render(<HistoryScreen />);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});

test("子供本人の履歴表示機能は引き続き利用できる", () => {
  render(<HistoryScreen />);

  expect(screen.getByText("収支グラフ")).toBeTruthy();
  expect(screen.getByText("取引履歴")).toBeTruthy();
});
