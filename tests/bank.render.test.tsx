import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import BankScreen from "../app/bank";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchBankAccount = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankDeposit = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankWithdraw = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("../lib/bankService", () => ({
  fetchBankAccount: (...args: unknown[]) => mockFetchBankAccount(...args),
  bankDeposit: (...args: unknown[]) => mockBankDeposit(...args),
  bankWithdraw: (...args: unknown[]) => mockBankWithdraw(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

const mockReloadLoans = jest.fn<() => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/useLoans", () => ({
  useLoans: () => ({
    loans: [],
    offer: {
      loan_limit: 1000,
      monthly_interest_rate: 0.05,
      term_days: 30,
      outstanding_principal: 50,
      treasury_available: 800,
      available_amount: 800,
      has_overdue: false,
    },
    loading: false,
    error: null,
    isLive: true,
    reload: mockReloadLoans,
  }),
}));

/** 銀行操作が返す Result。成功の形を1か所で作る。 */
const success = { status: "success", value: null } as const;

/** 失敗の Result を作る。 */
function failure(code: string, dbMessage?: string) {
  return {
    status: "failure",
    error: dbMessage ? { code, detail: { dbCode: "P0001", dbMessage } } : { code },
  };
}

// 実際のSupabaseユーザーはIDがuuid。実データを触る経路のテストはこちらを使う
const child = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

// 開発用クイックログイン（「子供として入る」）で入るモックID。uuidではない
const quickLoginChild = { ...child, id: "user-child-1" };

const account = {
  id: "bank-1",
  user_id: "22222222-2222-2222-2222-222222222222",
  deposit_balance: 200,
  interest_rate: 0.05,
  loan_balance: 50,
  loan_rate: 0.1,
  loan_limit: 1000,
  loan_term_days: 30,
  updated_at: "2026-07-13T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
  mockFetchBankAccount.mockResolvedValue(account);
  mockFetchUserBalance.mockResolvedValue(320);
});

test("所持金と預金残高、ローンの借入可能額を表示する", async () => {
  render(<BankScreen />);

  await waitFor(() => {
    expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol");
  });
  expect(screen.getByLabelText("預金残高")).toHaveTextContent("200 gol");
  expect(screen.getByLabelText("借入可能額")).toHaveTextContent("800 gol");
});

test.each([
  ["預入", "deposit"],
  ["引き出し", "withdraw"],
])("%sボタンを押すと金額入力モーダルが開く", async (button) => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: button }));

  expect(screen.getByLabelText("金額")).toBeTruthy();
});

test("預入モーダルで金額を入力して確定すると bankDeposit が呼ばれる", async () => {
  mockBankDeposit.mockResolvedValue(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() => {
    expect(mockBankDeposit).toHaveBeenCalledWith(child.id, 100);
  });
});

test("開発用クイックログイン（非UUIDのモックID）では銀行の操作ができない", async () => {
  // bank_accounts.user_id は uuid 型。モックIDでは実データを引けないので、
  // 残高表示も操作もプレビュー扱いにする（#174）
  useAppStore.setState({ user: quickLoginChild });
  render(<BankScreen />);

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");

  const confirmButton = screen.getByRole("button", { name: "預入を確定" });
  expect(confirmButton.props.accessibilityState.disabled).toBe(true);

  fireEvent.press(confirmButton);
  await waitFor(() => expect(mockBankDeposit).not.toHaveBeenCalled());
});

test("所持金を超える預入は確定ボタンが無効になる", async () => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "9999");

  expect(screen.getByRole("button", { name: "預入を確定" }).props.accessibilityState.disabled).toBe(
    true,
  );
});

test("戻るボタンで直前の画面に戻る", async () => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("預金残高を超える引き出しは確定ボタンが無効になる", async () => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("預金残高")).toHaveTextContent("200 gol"));

  fireEvent.press(screen.getByRole("button", { name: "引き出し" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "201");

  expect(screen.getByRole("button", { name: "引き出しを確定" }).props.accessibilityState.disabled).toBe(
    true,
  );
});

test("未ログイン時は銀行の内容を表示しない", () => {
  useAppStore.setState({ user: null });
  render(<BankScreen />);

  expect(screen.getByText("銀行を利用するにはログインしてください。")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "預入" })).toBeNull();

  fireEvent.press(screen.getByRole("button", { name: "戻る" }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

// --- 操作結果ごとの画面の振る舞い（Issue #188）---

test("預入が成功すると、残高を取り直してモーダルを閉じる", async () => {
  mockBankDeposit.mockResolvedValue(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  // 預入後に取り直したときの残高
  mockFetchUserBalance.mockResolvedValue(220);

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  // 残高の取り直しが終わるのを待つ（画面はその完了後にモーダルを閉じる）
  await waitFor(() =>
    expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("220 gol"),
  );
  expect(mockFetchBankAccount).toHaveBeenCalled();
  // 成功後はモーダルを閉じる
  await waitFor(() => expect(screen.queryByLabelText("金額")).toBeNull());
});

test("業務ルールで拒否されると、DBのメッセージを表示しモーダルを閉じない", async () => {
  mockBankDeposit.mockResolvedValue(failure("OPERATION_REJECTED", "所持金が不足しています"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() => expect(screen.getByText("所持金が不足しています")).toBeTruthy());
  // 入力を直せるよう、モーダルは開いたままにする
  expect(screen.getByLabelText("金額")).toBeTruthy();
});

test("結果が不明な場合は、確認を促してモーダルを閉じず、残高を取り直す", async () => {
  mockBankDeposit.mockResolvedValue(failure("OUTCOME_UNKNOWN"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  // DB側が成功していた場合に見えるはずの残高
  mockFetchUserBalance.mockResolvedValue(220);
  mockFetchBankAccount.mockClear();

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() =>
    expect(screen.getByText(/結果を確認できませんでした/)).toBeTruthy(),
  );
  // DB側は成功しているかもしれないため、モーダルを閉じずに最新の残高を見せる
  expect(screen.getByLabelText("金額")).toBeTruthy();
  await waitFor(() => expect(mockFetchBankAccount).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("220 gol"),
  );
});

test("通信できない読み取りの失敗では、DBの文言をそのまま出さない", async () => {
  mockBankDeposit.mockResolvedValue(failure("UNEXPECTED"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() =>
    expect(screen.getByText("問題が発生しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
});

test("口座の取得に失敗したら、預金を0円と出さずに「—」にする", async () => {
  // Issue #212: account が null のまま `?? 0` されるため、取得に失敗しても
  // 「預金0 gol・借入0 gol」と本当の残高のように表示されていた
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchBankAccount.mockRejectedValue(new Error("network error"));

  render(<BankScreen />);

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("口座の情報を取得できませんでした");
  });
  expect(screen.getByLabelText("預金残高")).toHaveTextContent("—");
  expect(screen.queryByText("0 gol")).toBeNull();

  warnSpy.mockRestore();
});

test("口座の取得に失敗したら、預入と引き出しを押せなくする", async () => {
  // 額が分からないまま操作させると、canWithdraw などが0で判定するため
  // 「確定が押せないが理由が分からない」形になる
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchBankAccount.mockRejectedValue(new Error("network error"));

  render(<BankScreen />);

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  for (const name of ["預入", "引き出し"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }

  warnSpy.mockRestore();
});
