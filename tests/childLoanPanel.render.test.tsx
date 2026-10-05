import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { Loan, LoanOffer } from "../types";
import { useLoanRepaymentStore } from "../store/loanRepaymentStore";

const mockRequestLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("loan-new"));
const mockRepayLoan = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("repayment-new"));
jest.mock("../lib/loanService", () => ({
  requestLoan: (...args: unknown[]) => mockRequestLoan(...args),
  repayLoan: (...args: unknown[]) => mockRepayLoan(...args),
}));

const mockReload = jest.fn<() => Promise<void>>(() => Promise.resolve());
let mockLoans: Loan[] = [];
let mockLoading = false;
let mockError: string | null = null;
const defaultOffer = {
  loan_limit: 500, monthly_interest_rate: 0.05, term_days: 30,
  outstanding_principal: 0, treasury_available: 300, available_amount: 300, has_overdue: false,
} as LoanOffer;
let mockOffer: LoanOffer | null = defaultOffer;
jest.mock("../lib/useLoans", () => ({
  useLoans: () => ({
    loans: mockLoans,
    offer: mockOffer,
    loading: mockLoading,
    error: mockError,
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
  mockLoading = false;
  mockError = null;
  mockOffer = defaultOffer;
  useLoanRepaymentStore.setState({ pendingByUser: {}, sendingByUser: {} });
});

test("借入可能額・月利・期限と申請前の返済予定額を表示する", () => {
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  expect(screen.getByLabelText("借入可能額")).toHaveTextContent("300 gol");
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "101");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  expect(screen.getByText("元本 101 gol ＋ 利息 6 gol")).toBeTruthy();
  expect(screen.getByText("返済予定額 107 gol")).toBeTruthy();
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
  expect(mockRequestLoan.mock.calls[0].slice(3, 5)).toEqual([0.05, 30]);
});

test("申請が失敗したら最新の貸出条件を再取得する", async () => {
  mockRequestLoan.mockRejectedValueOnce(new Error("ローン条件が変更されました。内容を確認してもう一度申請してください"));
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.press(screen.getByLabelText("ローンを申請する"));
  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
  expect(screen.getByText("ローン条件が変更されました。内容を確認してもう一度申請してください")).toBeTruthy();
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
  expect(screen.getByText("元本 100 gol ／ 利息 14 gol")).toBeTruthy();
  expect(screen.getByText("残額 114 gol")).toBeTruthy();
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

test.each(["0", "-1", "1.5", "abc", "1e2", "9007199254740992"])("申請・返済で不正入力%sを変換せず拒否する", (input) => {
  mockLoans = [activeLoan];
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), input);
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), input);
  expect(screen.getByLabelText("ローン申請額")).toHaveProp("value", input);
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", input);
  expect(screen.getAllByText("金額は1以上の整数で入力してください。")).toHaveLength(2);
  expect(screen.getByLabelText("ローンを申請する")).toBeDisabled();
  expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();
  fireEvent.press(screen.getByLabelText("ローンを申請する"));
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  expect(mockRequestLoan).not.toHaveBeenCalled();
  expect(mockRepayLoan).not.toHaveBeenCalled();
});

test("申請上限超過を説明し、最大額ちょうどを入力・申請できる", async () => {
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "301");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  expect(screen.getByText("借入可能額を超える金額は申請できません。")).toBeTruthy();
  expect(screen.getByLabelText("ローンを申請する")).toBeDisabled();
  expect(screen.getByLabelText("ローン申請の最大金額")).toHaveTextContent("入力可能な最大金額 300 gol");
  fireEvent.press(screen.getByLabelText("借入可能な最大額を入力"));
  expect(screen.getByLabelText("ローン申請額")).toHaveProp("value", "300");
  fireEvent.press(screen.getByLabelText("ローンを申請する"));
  await waitFor(() => expect(mockRequestLoan).toHaveBeenCalledWith("child-1", 300, "本を買う", 0.05, 30, expect.any(String)));
});

test.each([
  [50, 50, "所持金を超える金額は返済できません。"],
  [200, 105, "ローンの残額を超える金額は返済できません。"],
])("所持金%sの返済は所持金と元利残額の小さい方を上限にする", async (walletBalance, maximum, reason) => {
  mockLoans = [activeLoan];
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={walletBalance as number} />);
  expect(screen.getByLabelText("本を買うの返済可能な最大金額")).toHaveTextContent(`返済可能な最大金額 ${maximum} gol`);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), String(Number(maximum) + 1));
  expect(screen.getByText(reason as string)).toBeTruthy();
  expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();
  fireEvent.press(screen.getByLabelText("本を買うの返済可能な最大額を入力"));
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", String(maximum));
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(mockRepayLoan).toHaveBeenCalledWith("loan-1", "child-1", maximum, expect.any(String)));
});

test.each(["申請", "返済"])("%sの処理中は入力を固定し、連続タップでも一度だけ送信する", async (operation) => {
  mockLoans = [activeLoan];
  let resolveOperation!: (value: string) => void;
  const service = operation === "申請" ? mockRequestLoan : mockRepayLoan;
  service.mockImplementationOnce(() => new Promise((resolve) => { resolveOperation = resolve; }));
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  const button = screen.getByLabelText(operation === "申請" ? "ローンを申請する" : "本を買うを返済する");
  fireEvent.press(button);
  fireEvent.press(button);
  expect(screen.queryByLabelText("返済の結果を確認")).toBeNull();
  expect(service).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("ローン申請額")).toHaveProp("editable", false);
  expect(screen.getByLabelText("ローンの用途")).toHaveProp("editable", false);
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("editable", false);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "31");
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  resolveOperation("done");
  await waitFor(() => expect(screen.getByLabelText("ローン申請額")).toHaveProp("editable", true));
});

test("応答待ちの画面を離れても二重返済せず、失敗後は再表示で元の返済を確認できる", async () => {
  mockLoans = [activeLoan];
  let rejectOperation!: (reason: unknown) => void;
  mockRepayLoan.mockImplementationOnce(() => new Promise((_, reject) => { rejectOperation = reject; }));
  const firstView = render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  firstView.unmount();
  const secondView = render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  expect(screen.queryByLabelText("返済の結果を確認")).toBeNull();
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  expect(mockRepayLoan).toHaveBeenCalledTimes(1);
  rejectOperation({ code: "", message: "Failed to fetch" });
  await waitFor(() => expect(screen.getByLabelText("返済の結果を確認")).not.toBeDisabled());
  secondView.unmount();
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={20} />);
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  expect(screen.getByLabelText("本を買うの返済入力をキャンセル")).toBeDisabled();
  expect(screen.getByLabelText("返済の結果を確認")).not.toBeDisabled();
  fireEvent.press(screen.getByLabelText("返済の結果を確認"));
  await waitFor(() => expect(mockRepayLoan).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(useLoanRepaymentStore.getState().pendingByUser["child-1"]).toBeUndefined());
  await waitFor(() => expect(screen.queryByLabelText("返済の結果を確認")).toBeNull());
  expect(mockRepayLoan.mock.calls[1]).toEqual(mockRepayLoan.mock.calls[0]);
});

test("別利用者の確認待ち返済は表示せず、その利用者の申請を妨げない", () => {
  useLoanRepaymentStore.setState({ pendingByUser: { "child-other": { loanId: "loan-other", amount: 30, key: "other-key" } } });
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  expect(screen.queryByLabelText("返済の結果を確認")).toBeNull();
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  expect(screen.getByLabelText("ローンを申請する")).not.toBeDisabled();
});

test.each(["読み込み中", "取得失敗"])("貸出条件が%sなら上限を不明と表示し、形式エラーだけ判定する", (state) => {
  mockOffer = null;
  mockLoading = state === "読み込み中";
  mockError = state === "取得失敗" ? "ローン情報を取得できませんでした" : null;
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  expect(screen.getByLabelText("ローン申請の最大金額")).toHaveTextContent("入力可能な最大金額 —");
  expect(screen.queryByText("借入可能額を超える金額は申請できません。")).toBeNull();
  expect(screen.getByLabelText("ローンを申請する")).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "1.5");
  expect(screen.getByText("金額は1以上の整数で入力してください。")).toBeTruthy();
});

test("取得失敗後に古い貸出条件が残っていても上限超過のエラーは出さない", () => {
  mockError = "ローン情報を取得できませんでした";
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "301");
  expect(screen.queryByText("借入可能額を超える金額は申請できません。")).toBeNull();
});

test.each([
  new TypeError("Failed to fetch"),
  Object.assign(new Error("TypeError: Failed to fetch"), { code: "" }),
])("通信エラーの生の文言は返済画面へ表示しない", async (failure) => {
  mockLoans = [activeLoan];
  mockRepayLoan.mockRejectedValueOnce(failure);
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(screen.getByLabelText("返済の結果を確認")).not.toBeDisabled());
  expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  expect(screen.getByText("code" in failure
    ? "結果を確認できませんでした。画面を更新して、反映されているか確認してください。"
    : "問題が発生しました。時間をおいて再度お試しください。")).toBeTruthy();
});

test.each(["読込中", "取得失敗"])("ローン情報が%sなら古い条件で送信しない", (state) => {
  mockLoans = [activeLoan];
  mockLoading = state === "読込中";
  mockError = state === "取得失敗" ? "ローン情報を取得できませんでした" : null;
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  expect(screen.getByLabelText("ローンを申請する")).toBeDisabled();
  expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();
});

test("返済失敗時は入力と残高を保持し、同じキーで再試行できる", async () => {
  mockLoans = [activeLoan];
  mockRepayLoan.mockRejectedValueOnce(new Error("返済できませんでした"));
  const onBalanceChanged = jest.fn<() => Promise<void>>(() => Promise.resolve());
  render(<ChildLoanPanel onBalanceChanged={onBalanceChanged} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(screen.getByText("問題が発生しました。時間をおいて再度お試しください。")).toBeTruthy());
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  expect(onBalanceChanged).not.toHaveBeenCalled();
  expect(mockReload).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("返済の結果を確認"));
  await waitFor(() => expect(onBalanceChanged).toHaveBeenCalledTimes(1));
  expect(mockRepayLoan.mock.calls[1]).toEqual(mockRepayLoan.mock.calls[0]);
});

test("返済反映後に応答が失われても、変更・キャンセルを止めて元のキーで照合する", async () => {
  mockLoans = [activeLoan];
  mockRepayLoan.mockRejectedValueOnce({ code: "", message: "Failed to fetch" });
  const onBalanceChanged = jest.fn<() => Promise<void>>(() => Promise.resolve());
  const view = render(<ChildLoanPanel onBalanceChanged={onBalanceChanged} userId="child-1" walletBalance={50} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(screen.getByLabelText("返済の結果を確認")).not.toBeDisabled());

  // DBでは反映済みだが、元の30ゴルを新規操作としては払えない所持金になった状況。
  mockLoans = [{ ...activeLoan, interest_repaid: 5, principal_repaid: 25 }];
  view.rerender(<ChildLoanPanel onBalanceChanged={onBalanceChanged} userId="child-1" walletBalance={20} />);
  expect(screen.getByLabelText("本を買うの返済入力をキャンセル")).toBeDisabled();
  expect(screen.getByLabelText("本を買うの返済可能な最大額を入力")).toBeDisabled();
  expect(screen.getByLabelText("ローン申請の入力をキャンセル")).toBeDisabled();
  fireEvent.press(screen.getByLabelText("本を買うの返済入力をキャンセル"));
  fireEvent.press(screen.getByLabelText("本を買うの返済可能な最大額を入力"));
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "20");
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();

  fireEvent.press(screen.getByLabelText("返済の結果を確認"));
  await waitFor(() => expect(onBalanceChanged).toHaveBeenCalledTimes(1));
  expect(mockRepayLoan.mock.calls[1]).toEqual(mockRepayLoan.mock.calls[0]);
  expect(screen.queryByLabelText("返済の結果を確認")).toBeNull();
});

test("DBが返済を明示的に拒否した場合は金額を修正・キャンセルできる", async () => {
  mockLoans = [activeLoan];
  mockRepayLoan.mockRejectedValueOnce({ code: "P0001", message: "所持金が不足しています" });
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("本を買うを返済する"));
  await waitFor(() => expect(screen.getByText("所持金が不足しています")).toBeTruthy());
  expect(screen.queryByLabelText("返済の結果を確認")).toBeNull();
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("editable", true);
  fireEvent.press(screen.getByLabelText("本を買うの返済入力をキャンセル"));
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "");
});

test("申請・返済の入力をキャンセルしても取引は送信しない", () => {
  mockLoans = [activeLoan];
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={200} />);
  fireEvent.changeText(screen.getByLabelText("ローン申請額"), "100");
  fireEvent.changeText(screen.getByLabelText("ローンの用途"), "本を買う");
  fireEvent.changeText(screen.getByLabelText("本を買うの返済額"), "30");
  fireEvent.press(screen.getByLabelText("ローン申請の入力をキャンセル"));
  fireEvent.press(screen.getByLabelText("本を買うの返済入力をキャンセル"));
  expect(screen.getByLabelText("ローン申請額")).toHaveProp("value", "");
  expect(screen.getByLabelText("ローンの用途")).toHaveProp("value", "");
  expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "");
  expect(mockRequestLoan).not.toHaveBeenCalled();
  expect(mockRepayLoan).not.toHaveBeenCalled();
});

test.each([0, 30.9])("所持金%sから返済の最大額を整数で表示する", (walletBalance) => {
  mockLoans = [activeLoan];
  render(<ChildLoanPanel onBalanceChanged={() => Promise.resolve()} userId="child-1" walletBalance={walletBalance} />);
  expect(screen.getByLabelText("本を買うの返済可能な最大金額")).toHaveTextContent(`返済可能な最大金額 ${Math.floor(walletBalance)} gol`);
  const fillMaximum = screen.getByLabelText("本を買うの返済可能な最大額を入力");
  if (walletBalance === 0) {
    expect(fillMaximum).toBeDisabled();
    expect(screen.getByLabelText("本を買うを返済する")).toBeDisabled();
  } else {
    fireEvent.press(fillMaximum);
    expect(screen.getByLabelText("本を買うの返済額")).toHaveProp("value", "30");
  }
});
