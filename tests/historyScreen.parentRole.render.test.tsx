import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

import HistoryScreen from "../components/HistoryScreen";

test("大人が履歴画面を開いたときは大人用の下部メニューバーを表示する", () => {
  render(<HistoryScreen />);

  expect(screen.getByRole("button", { name: "ホーム" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ローン" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ストア" })).toBeTruthy();
});
