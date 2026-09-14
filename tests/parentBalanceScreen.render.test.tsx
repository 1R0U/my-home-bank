import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ParentBalanceScreen from "../components/ParentBalanceScreen";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

test("タブの外に出た画面のため、他タブへ直接ジャンプできる簡易ナビゲーションを表示する", () => {
  render(<ParentBalanceScreen />);

  fireEvent.press(screen.getByLabelText("ストア"));

  expect(router.replace).toHaveBeenCalledWith("/store-adult");
});

test("ホームへのジャンプは/main-adultへreplaceする", () => {
  render(<ParentBalanceScreen />);

  fireEvent.press(screen.getByLabelText("ホーム"));

  expect(router.replace).toHaveBeenCalledWith("/main-adult");
});
