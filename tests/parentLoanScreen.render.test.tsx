import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { Loan } from "../types";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockApproveLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("loan-1"));
const mockRejectLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("loan-1"));
const mockUpdateLoanSettings = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockFetchFamilyBorrowers = jest.fn<(...args: unknown[]) => Promise<{ id: string; name: string }[]>>(() => Promise.resolve([{ id: "child-1", name: "たろう" }]));
const defaultOffer = {
  loan_limit: 500,
  monthly_interest_rate: 0.05,
  term_days: 30,
  outstanding_principal: 0,
  treasury_available: 300,
  available_amount: 300,
  has_overdue: false,
};
const mockFetchLoanOffer = jest.fn<(...args: unknown[]) => Promise<any>>(() => Promise.resolve(defaultOffer));
jest.mock("../lib/loanService", () => ({
  approveLoan: (...args: unknown[]) => mockApproveLoan(...args),
  rejectLoan: (...args: unknown[]) => mockRejectLoan(...args),
  updateLoanSettings: (...args: unknown[]) => mockUpdateLoanSettings(...args),
  fetchFamilyBorrowers: (...args: unknown[]) => mockFetchFamilyBorrowers(...args),
  fetchLoanOffer: (...args: unknown[]) => mockFetchLoanOffer(...args),
}));

const pendingLoan: Loan = {
  id: "loan-1",
  family_id: "family-1",
  borrower_id: "child-1",
  requested_amount: 100,
  purpose: "本を買う",
  status: "pending",
  monthly_interest_rate: 0.07,
  term_days: 60,
  principal_amount: null,
  interest_amount: null,
  principal_repaid: 0,
  interest_repaid: 0,
  request_idempotency_key: "request-1",
  approved_by: null,
  requested_at: "2026-09-01T00:00:00Z",
  approved_at: null,
  rejected_at: null,
  due_at: null,
  completed_at: null,
  updated_at: "2026-09-01T00:00:00Z",
};
const mockReload = jest.fn<() => Promise<void>>(() => Promise.resolve());
let mockIsLive = true;
jest.mock("../lib/useLoans", () => ({
  useLoans: () => ({ loans: [pendingLoan], loading: false, error: null, isLive: mockIsLive, reload: mockReload }),
}));

import ParentLoanScreen from "../components/ParentLoanScreen";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsLive = true;
  mockFetchFamilyBorrowers.mockResolvedValue([{ id: "child-1", name: "たろう" }]);
  mockFetchLoanOffer.mockResolvedValue(defaultOffer);
  useAppStore.setState({
    user: {
      id: "parent-1",
      family_id: "family-1",
      name: "親",
      role: "parent",
      balance: 0,
      created_at: "2026-09-01T00:00:00Z",
    },
  });
});

test("親が申請の金利・総額・金庫への影響を確認して承認できる", async () => {
  render(<ParentLoanScreen />);
  await waitFor(() => expect(screen.getByText("たろう")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: /たろう/ }));
  expect(screen.getByText("月利 7% ／ 60日")).toBeTruthy();
  expect(screen.getByText("返済総額 114 HMC")).toBeTruthy();
  expect(screen.getByText("承認後の金庫貸出可能残高 200 HMC")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("ローンを承認"));
  await waitFor(() => expect(mockApproveLoan).toHaveBeenCalledWith("loan-1", "parent-1"));
});

test("親が子どもごとの限度額・月利・期限を保存できる", async () => {
  render(<ParentLoanScreen />);
  await waitFor(() => expect(screen.getByText("たろう")).toBeTruthy());
  fireEvent.press(screen.getByRole("tab", { name: "設定" }));
  fireEvent.changeText(screen.getByLabelText("たろうのローン限度額"), "700");
  fireEvent.changeText(screen.getByLabelText("たろうの月利"), "4");
  fireEvent.changeText(screen.getByLabelText("たろうの返済期限"), "45");
  fireEvent.press(screen.getByLabelText("たろうのローン設定を保存"));
  await waitFor(() => expect(mockUpdateLoanSettings).toHaveBeenCalledWith("child-1", 700, 0.04, 45));
});

test("月利入力をパーセント表記の小数4桁までに制限する", async () => {
  render(<ParentLoanScreen />);
  await waitFor(() => expect(screen.getByText("たろう")).toBeTruthy());
  fireEvent.press(screen.getByRole("tab", { name: "設定" }));
  fireEvent.changeText(screen.getByLabelText("たろうの月利"), "5.123456");
  expect(screen.getByLabelText("たろうの月利").props.value).toBe("5.1234");
});

test("1人の設定取得に失敗しても他の子どもと失敗した子どもの名前を表示する", async () => {
  mockFetchFamilyBorrowers.mockResolvedValue([
    { id: "child-1", name: "たろう" },
    { id: "child-2", name: "はなこ" },
  ]);
  mockFetchLoanOffer.mockImplementation((borrowerId) => borrowerId === "child-2"
    ? Promise.reject(new Error("口座なし"))
    : Promise.resolve(defaultOffer));

  render(<ParentLoanScreen />);
  await waitFor(() => expect(screen.getByText("たろう")).toBeTruthy());
  fireEvent.press(screen.getByRole("tab", { name: "設定" }));
  expect(screen.getByText("はなこ")).toBeTruthy();
  expect(screen.getByText("ローン設定を取得できませんでした")).toBeTruthy();
  expect(screen.getByLabelText("たろうのローン設定を保存")).toBeTruthy();
});

test("プレビュー中は承認・却下・設定保存ボタンを無効表示にする", async () => {
  const { rerender } = render(<ParentLoanScreen />);
  await waitFor(() => expect(screen.getByText("たろう")).toBeTruthy());
  mockIsLive = false;
  rerender(<ParentLoanScreen />);
  fireEvent.press(screen.getByRole("button", { name: /たろう/ }));
  expect(screen.getByLabelText("ローンを承認").props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText("ローンを却下").props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole("tab", { name: "設定" }));
  expect(screen.getByLabelText("たろうのローン設定を保存").props.accessibilityState.disabled).toBe(true);
});
