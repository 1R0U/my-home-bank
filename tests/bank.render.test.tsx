import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import BankScreen from "../app/bank";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

const mockFetchBankAccount = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankDeposit = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankWithdraw = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankBorrow = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankRepay = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("../lib/bankService", () => ({
  fetchBankAccount: (...args: unknown[]) => mockFetchBankAccount(...args),
  bankDeposit: (...args: unknown[]) => mockBankDeposit(...args),
  bankWithdraw: (...args: unknown[]) => mockBankWithdraw(...args),
  bankBorrow: (...args: unknown[]) => mockBankBorrow(...args),
  bankRepay: (...args: unknown[]) => mockBankRepay(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

const child = {
  id: "user-child-1",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

const account = {
  id: "bank-1",
  user_id: "user-child-1",
  deposit_balance: 200,
  interest_rate: 0.05,
  loan_balance: 50,
  loan_rate: 0.1,
  updated_at: "2026-07-13T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
  mockFetchBankAccount.mockResolvedValue(account);
  mockFetchUserBalance.mockResolvedValue(320);
});

test("所持金と口座残高（預金・借入）を表示する", async () => {
  render(<BankScreen />);

  await waitFor(() => {
    expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320");
  });
  expect(screen.getByLabelText("預金残高")).toHaveTextContent("￥200");
  expect(screen.getByLabelText("借入残高")).toHaveTextContent("￥50");
});

test.each([
  ["預入", "deposit"],
  ["引き出し", "withdraw"],
  ["借り入れ", "borrow"],
  ["返済", "repay"],
])("%sボタンを押すと金額入力モーダルが開く", async (button) => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320"));

  fireEvent.press(screen.getByRole("button", { name: button }));

  expect(screen.getByLabelText("金額")).toBeTruthy();
});

test("預入モーダルで金額を入力して確定すると bankDeposit が呼ばれる", async () => {
  mockBankDeposit.mockResolvedValue(undefined);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() => {
    expect(mockBankDeposit).toHaveBeenCalledWith("user-child-1", 100);
  });
});

test("所持金を超える預入は確定ボタンが無効になる", async () => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "9999");

  expect(screen.getByRole("button", { name: "預入を確定" }).props.accessibilityState.disabled).toBe(
    true,
  );
});

test("戻るボタンで直前の画面に戻る", async () => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("￥320"));

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
