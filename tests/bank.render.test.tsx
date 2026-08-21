import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import { Alert } from "react-native";
import BankScreen from "../app/bank";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

const parent = {
  id: "user-parent-1",
  name: "お父さん",
  role: "parent" as const,
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
};

const child = {
  id: "user-child-1",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
});

test.each([
  ["預入", "預入", "テスト: 預入を実行しました"],
  ["引き出し", "引き出し", "テスト: 引き出しを実行しました"],
  ["借り入れ", "借り入れ", "テスト: 借り入れを実行しました"],
  ["返済", "返済", "テスト: 返済を実行しました"],
])("%sボタンで確認ダイアログを表示する", (button, title, message) => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  render(<BankScreen />);

  fireEvent.press(screen.getByRole("button", { name: button }));

  expect(alert).toHaveBeenCalledWith(title, message);
});

test("子供の所持金と口座残高を表示する", () => {
  render(<BankScreen />);

  expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320");
  expect(screen.getByLabelText("預金残高")).toHaveTextContent("￥200");
  expect(screen.getByLabelText("借入残高")).toHaveTextContent("￥0");
});

test("大人の所持金と口座残高に切り替わる", () => {
  useAppStore.setState({ user: parent });
  render(<BankScreen />);

  expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥500");
  expect(screen.getByLabelText("預金残高")).toHaveTextContent("￥0");
  expect(screen.getByLabelText("借入残高")).toHaveTextContent("￥0");
});

test("戻るボタンで直前の画面に戻る", () => {
  render(<BankScreen />);

  fireEvent.press(screen.getByRole("button", { name: "戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("未ログイン時は銀行の内容を表示しない", () => {
  useAppStore.setState({ user: null });
  render(<BankScreen />);

  expect(screen.getByText("銀行を利用するにはログインしてください。")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "預入" })).toBeNull();

  fireEvent.press(screen.getByRole("button", { name: "戻る" }));
  expect(router.back).toHaveBeenCalledTimes(1);
});
