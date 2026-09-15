import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ParentBalanceScreen from "../components/ParentBalanceScreen";

let mockPathname = "/balance-adult";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  usePathname: () => mockPathname,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/balance-adult";
});

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

test("現在地と同じ遷移先の場合はreplaceしない", () => {
  mockPathname = "/main-adult";
  render(<ParentBalanceScreen />);

  fireEvent.press(screen.getByLabelText("ホーム"));

  expect(router.replace).not.toHaveBeenCalled();
});
