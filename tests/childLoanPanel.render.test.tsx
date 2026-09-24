import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { Loan } from "../types";

const mockRequestLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("loan-new"));
const mockRepayLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("repayment-new"));
jest.mock("../lib/loanService", () => ({
  requestLoan: (...args: unknown[]) => mockRequestLoan(...args),
  repayLoan: (...args: unknown[]) => mockRepayLoan(...args),
}));

const mockReload = jest.fn<() => Promise<void>>(() => Promise.resolve());
let mockLoans: Loan[] = [];
jest.mock("../lib/useLoans", () => ({
  useLoans: () => ({
    loans: mockLoans,
    offer: {
      loan_limit: 500,
      monthly_interest_rate: 0.05,
      term_days: 30,
      outstanding_principal: 0,
      treasury_available: 300,
      available_amount: 300,
      has_overdue: false,
    },
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  }),
}));

import ChildLoanPanel from "../components/loan/ChildLoanPanel";

const activeLoan: Loan = {
  id: "loan-1",
  family_id: "family-1",
  borrower_id: "child-1",
  requested_amount: 100,
  purpose: "本を買う",
  status: "active",
  monthly_interest_rate: 0.05,
  term_days: 30,
  principal_amount: 100,
  interest_amount: 5,
  principal_repaid: 0,
  interest_repaid: 0,
  request_idempotency_key: "request-1",
  approved_by: "parent-1",
  requested_at: "2026-09-01T00:00:00Z",
  approved_at: "2026-09-01T00:00:00Z",
  rejected_at: null,
  due_at: "2099-10-01T00:00:00Z",
  completed_at: null,
  updated_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLoans = [];
});

test("借入可能額・月利・期限と申請前の返済予定額を表示する", () => {
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  expect(screen.getByLabelText("借入可能額")).toHaveTextContent("300pt");
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "101");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  expect(screen.getByText("元本 101 HMC ＋ 利息 6 HMC")).toBeTruthy();
  expect(screen.getByText("返済予定額 107 HMC")).toBeTruthy();
});

test("申請額と用途を入力するとローン申請RPCを呼ぶ", async () => {
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.press(screen.getByLabelText("ローンを申請する"));
  await waitFor(() => expect(mockRequestLoan).toHaveBeenCalledTimes(1));
  expect(mockRequestLoan.mock.calls[0][0]).toBe("child-1");
  expect(mockRequestLoan.mock.calls[0][1]).toBe(100);
  expect(mockRequestLoan.mock.calls[0][2]).toBe("本を買う");
});

test("承認待ちには申請時に固定した利息と返済予定額を表示する", () => {
  mockLoans = [{
    ...activeLoan,
    id: "loan-pending",
    status: "pending",
    monthly_interest_rate: 0.07,
    term_days: 60,
    principal_amount: null,
    interest_amount: null,
    approved_by: null,
    approved_at: null,
    due_at: null,
  }];
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  expect(screen.getByText("元本 100 HMC ／ 利息 14 HMC")).toBeTruthy();
  expect(screen.getByText("残額 114 HMC")).toBeTruthy();
});

test("契約中ローンへ任意額を返済できる", async () => {
  mockLoans = [activeLoan];
  const onBalanceChanged = jest.fn<() => Promise<void>>(() => Promise.resolve());
  render(<ChildLoanPanel onBalanceChanged={onBalanceChanged} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(mockRepayLoan).toHaveBeenCalledTimes(1));
  expect(mockRepayLoan.mock.calls[0].slice(0, 3)).toEqual(["loan-1", "child-1", 30]);
  expect(onBalanceChanged).toHaveBeenCalledTimes(1);
});
