import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import BankScreen from "../app/bank";
import { CorruptPendingBankOperationError } from "../lib/bankOperation";
import { MAX_BANK_OPERATION_AMOUNT } from "../lib/bankUtils";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchBankAccount = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankDeposit = jest.fn<(...args: any[]) => Promise<any>>();
const mockBankWithdraw = jest.fn<(...args: any[]) => Promise<any>>();
const mockLoadPending = jest.fn<(...args: any[]) => Promise<any>>();
const mockSavePending = jest.fn<(...args: any[]) => Promise<any>>();
const mockClearPending = jest.fn<(...args: any[]) => Promise<any>>();
const mockDiscardCorrupt = jest.fn<(...args: any[]) => Promise<any>>();
const mockCreateOperationId = jest.fn<() => string>();
jest.mock("../lib/bankOperation", () => ({
  ...jest.requireActual<typeof import("../lib/bankOperation")>("../lib/bankOperation"),
  createBankOperationId: () => mockCreateOperationId(),
  loadPendingBankOperation: (...args: unknown[]) => mockLoadPending(...args),
  savePendingBankOperation: (...args: unknown[]) => mockSavePending(...args),
  clearPendingBankOperation: (...args: unknown[]) => mockClearPending(...args),
  discardCorruptPendingBankOperation: (...args: unknown[]) => mockDiscardCorrupt(...args),
}));

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
  jest.resetAllMocks();
  mockBankDeposit.mockResolvedValue(success);
  mockBankWithdraw.mockResolvedValue(success);
  mockReloadLoans.mockResolvedValue(undefined);
  useAppStore.setState({ user: child });
  mockFetchBankAccount.mockResolvedValue(account);
  mockFetchUserBalance.mockResolvedValue(320);
  mockLoadPending.mockResolvedValue(null);
  mockSavePending.mockResolvedValue(undefined);
  mockClearPending.mockResolvedValue(undefined);
  mockDiscardCorrupt.mockResolvedValue(undefined);
  mockCreateOperationId.mockReturnValue("19000000-0000-4000-8000-000000000001");
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
    expect(mockBankDeposit).toHaveBeenCalledWith(child.id, 100, expect.any(String));
  });
});

test("開発用クイックログイン（非UUIDのモックID）では銀行の操作ができない", async () => {
  // bank_accounts.user_id は uuid 型。モックIDでは実データを引けないので、
  // 残高表示も操作もプレビュー扱いにする（#174）
  useAppStore.setState({ user: quickLoginChild });
  render(<BankScreen />);

  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());

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
  expect(screen.getByText("所持金を超える金額は預け入れできません。")).toBeTruthy();

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
  expect(screen.getByText("預金残高を超える金額は引き出せません。")).toBeTruthy();

  expect(screen.getByRole("button", { name: "引き出しを確定" }).props.accessibilityState.disabled).toBe(
    true,
  );
});

test.each(["0", "-1", "1.5", "abc", "1e2"])("預入で不正入力%sを説明し、送信しない", async (input) => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), input);
  expect(screen.getByText("金額は1以上の整数で入力してください。")).toBeTruthy();
  expect(screen.getByRole("button", { name: "預入を確定" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  expect(mockBankDeposit).not.toHaveBeenCalled();
});

test.each([["預入", 320], ["引き出し", 200]])("%sは残高に応じた最大額を表示・入力でき、閉じると送信しない", async (label, maximum) => {
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("預金残高")).toHaveTextContent("200 gol"));
  await waitFor(() => expect(screen.getByRole("button", { name: label as string })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: label as string }));
  expect(screen.getByLabelText("入力可能な最大金額")).toHaveTextContent(`入力可能な最大金額 ${maximum} gol`);
  fireEvent.press(screen.getByLabelText("最大額を入力"));
  expect(screen.getByLabelText("金額")).toHaveProp("value", String(maximum));
  expect(screen.getByRole("button", { name: `${label}を確定` })).not.toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "閉じる" }));
  expect(screen.queryByLabelText("金額")).toBeNull();
  expect(mockBankDeposit).not.toHaveBeenCalled();
  expect(mockBankWithdraw).not.toHaveBeenCalled();
});

test.each(["預入", "引き出し"])("%sは上限超過を保存・送信せず、上限ちょうどは確定できる", async (label) => {
  const operationMock = label === "預入" ? mockBankDeposit : mockBankWithdraw;
  mockFetchUserBalance.mockResolvedValue(MAX_BANK_OPERATION_AMOUNT + 100);
  mockFetchBankAccount.mockResolvedValue({ ...account, deposit_balance: MAX_BANK_OPERATION_AMOUNT + 100 });
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("2,147,483,747 gol"));
  await waitFor(() => expect(screen.getByLabelText("預金残高")).toHaveTextContent("2,147,483,747 gol"));
  fireEvent.press(screen.getByRole("button", { name: label }));
  expect(screen.getByLabelText("入力可能な最大金額")).toHaveTextContent("入力可能な最大金額 2,147,483,647 gol");
  fireEvent.press(screen.getByLabelText("最大額を入力"));
  expect(screen.getByLabelText("金額")).toHaveProp("value", String(MAX_BANK_OPERATION_AMOUNT));
  fireEvent.changeText(screen.getByLabelText("金額"), String(MAX_BANK_OPERATION_AMOUNT + 1));
  const confirm = screen.getByRole("button", { name: `${label}を確定` });
  expect(confirm).toBeDisabled();
  expect(screen.getByText("1回の金額は2,147,483,647 gol以下にしてください。")).toBeTruthy();
  fireEvent.press(confirm);
  expect(mockSavePending).not.toHaveBeenCalled();
  expect(operationMock).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("金額"), String(MAX_BANK_OPERATION_AMOUNT));
  expect(screen.getByRole("button", { name: `${label}を確定` })).not.toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await waitFor(() => expect(operationMock).toHaveBeenCalledWith(child.id, MAX_BANK_OPERATION_AMOUNT,
    "19000000-0000-4000-8000-000000000001"));
});

test.each(["預入", "引き出し"])("保存済みの超過額の%sは同じIDで拒否を確認し、解除後は別の操作を開始できる", async (label) => {
  const operationMock = label === "預入" ? mockBankDeposit : mockBankWithdraw;
  const existing = { operationId: "19000000-0000-4000-8000-000000000009", userId: child.id,
    kind: label === "預入" ? "deposit" : "withdraw", amount: MAX_BANK_OPERATION_AMOUNT + 1 };
  mockLoadPending.mockResolvedValue(existing);
  operationMock.mockResolvedValueOnce(failure("INVALID_AMOUNT")).mockResolvedValueOnce(success);
  render(<BankScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "操作の結果を確認" }));
  expect(screen.getByLabelText("金額").props.editable).toBe(false);
  await waitFor(() => expect(screen.getByRole("button", { name: `${label}を確定` })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith(child.id, existing.operationId));
  expect(operationMock).toHaveBeenCalledWith(child.id, existing.amount, existing.operationId);
  expect(screen.getByText("金額を確認してください。")).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText("金額").props.editable).toBe(true));
  expect(mockCreateOperationId).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await waitFor(() => expect(operationMock).toHaveBeenCalledTimes(2));
  expect(operationMock.mock.calls[1]).toEqual([child.id, 100, "19000000-0000-4000-8000-000000000001"]);
  expect(operationMock.mock.calls[1][2]).not.toBe(existing.operationId);
});

test.each(["預入", "引き出し"])("保存済みの超過額の%sでも、拒否が確認できない応答なら元のIDを保持する", async (label) => {
  const operationMock = label === "預入" ? mockBankDeposit : mockBankWithdraw;
  const existing = { operationId: "19000000-0000-4000-8000-000000000010", userId: child.id,
    kind: label === "預入" ? "deposit" : "withdraw", amount: MAX_BANK_OPERATION_AMOUNT + 1 };
  mockLoadPending.mockResolvedValue(existing);
  operationMock.mockResolvedValue(failure("UNEXPECTED"));
  render(<BankScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "操作の結果を確認" }));
  await waitFor(() => expect(screen.getByRole("button", { name: `${label}を確定` })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await screen.findByText(/同じ操作の結果を確認するには/);
  expect(operationMock).toHaveBeenCalledWith(child.id, existing.amount, existing.operationId);
  expect(mockClearPending).not.toHaveBeenCalled();
  expect(screen.getByLabelText("金額").props.editable).toBe(false);
  expect(mockCreateOperationId).not.toHaveBeenCalled();
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

test("業務ルールで拒否されると、理由を表示しモーダルを閉じない", async () => {
  mockBankDeposit.mockResolvedValue(failure("INSUFFICIENT_BALANCE"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() => expect(screen.getByText("所持金が不足しています。")).toBeTruthy());
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

test.each(["UNEXPECTED", "OPERATION_REJECTED", "IDEMPOTENCY_CONFLICT"])("初回の%sでもIDを保持し、残高更新後に同じ操作を確認する", async (code) => {
  mockBankDeposit.mockResolvedValueOnce(failure(code)).mockResolvedValueOnce(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("320 gol"));

  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  mockFetchUserBalance.mockResolvedValue(0);
  mockFetchBankAccount.mockClear();
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));

  await waitFor(() =>
    expect(screen.getByText(/同じ操作の結果を確認するには/)).toBeTruthy(),
  );
  await waitFor(() => expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("0 gol"));
  expect(mockFetchBankAccount).toHaveBeenCalled();
  expect(mockClearPending).not.toHaveBeenCalled();
  expect(screen.getByLabelText("金額").props.editable).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: "閉じる" }));
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledTimes(2));
  expect(mockBankDeposit.mock.calls[1]).toEqual(mockBankDeposit.mock.calls[0]);
  expect(mockCreateOperationId).toHaveBeenCalledTimes(1);
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

test.each(["預入", "引き出し"])("%sの結果不明後は、残高不足でも同じIDと金額で確認する", async (label) => {
  const operationMock = label === "預入" ? mockBankDeposit : mockBankWithdraw;
  operationMock.mockResolvedValueOnce(failure("OUTCOME_UNKNOWN")).mockResolvedValueOnce(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: label })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: label }));
  fireEvent.changeText(screen.getByLabelText("金額"), "200");
  mockFetchUserBalance.mockResolvedValue(0);
  mockFetchBankAccount.mockResolvedValue({ ...account, deposit_balance: 0 });
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await waitFor(() => expect(screen.getByText(/二重には反映されません/)).toBeTruthy());
  await waitFor(() => expect(screen.getByRole("button", { name: `${label}を確定` })).not.toBeDisabled());
  expect(mockClearPending).not.toHaveBeenCalled();
  expect(screen.getByLabelText("金額").props.editable).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: `${label}を確定` }));
  await waitFor(() => expect(operationMock).toHaveBeenCalledTimes(2));
  expect(operationMock.mock.calls[0]).toEqual(operationMock.mock.calls[1]);
  await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith(child.id, operationMock.mock.calls[0][2]));
});

test("保存した未確認操作は画面を開き直しても復元し、金額を変えずに確認する", async () => {
  const pending = { operationId: "19000000-0000-4000-8000-000000000002", userId: child.id, kind: "deposit", amount: 300 };
  mockLoadPending.mockResolvedValue(pending);
  mockBankDeposit.mockResolvedValue(success);
  mockFetchUserBalance.mockResolvedValue(20);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "操作の結果を確認" })).toBeTruthy());
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  expect(screen.getByLabelText("金額").props.value).toBe("300");
  fireEvent.press(screen.getByRole("button", { name: "閉じる" }));
  expect(mockClearPending).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledWith(child.id, 300, pending.operationId));
  expect(mockCreateOperationId).not.toHaveBeenCalled();
});

test("結果不明後の再送が認証などで拒否されても、元のIDを捨てない", async () => {
  mockLoadPending.mockResolvedValue({ operationId: "19000000-0000-4000-8000-000000000005", userId: child.id, kind: "deposit", amount: 100 });
  mockBankDeposit.mockResolvedValueOnce(failure("UNEXPECTED")).mockResolvedValueOnce(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "操作の結果を確認" })).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "預入を確定" })).not.toBeDisabled());
  expect(mockClearPending).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledTimes(2));
  expect(mockBankDeposit.mock.calls[0]).toEqual(mockBankDeposit.mock.calls[1]);
});

test("操作の端末保存に失敗したら、DBへ送らない", async () => {
  mockSavePending.mockRejectedValueOnce(new Error("保存失敗"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(screen.getByText(/問題が発生しました/)).toBeTruthy());
  expect(mockBankDeposit).not.toHaveBeenCalled();
});

test("同じIDの確認で残高不足が確定したら、未確認操作を解除する", async () => {
  const pending = { operationId: "19000000-0000-4000-8000-000000000006", userId: child.id, kind: "deposit", amount: 100 };
  mockLoadPending.mockResolvedValue(pending);
  mockBankDeposit.mockResolvedValue(failure("INSUFFICIENT_BALANCE"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "操作の結果を確認" })).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith(child.id, pending.operationId));
  await waitFor(() => expect(screen.getByLabelText("金額").props.editable).toBe(true));
});

test("確定ボタンを連続で押しても、保存と送信は一度だけ行う", async () => {
  let release!: () => void;
  mockSavePending.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  mockBankDeposit.mockResolvedValue(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  const confirm = screen.getByRole("button", { name: "預入を確定" });
  fireEvent.press(confirm);
  fireEvent.press(confirm);
  expect(mockSavePending).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledTimes(1));
});

test("確定的な拒否の後は入力を直し、新しいIDで別の操作を始められる", async () => {
  mockCreateOperationId.mockReturnValueOnce("19000000-0000-4000-8000-000000000003").mockReturnValueOnce("19000000-0000-4000-8000-000000000004");
  mockBankDeposit.mockResolvedValueOnce(failure("INSUFFICIENT_BALANCE")).mockResolvedValueOnce(success);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(screen.getByLabelText("金額").props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText("金額"), "50");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledTimes(2));
  expect(mockBankDeposit.mock.calls[0][2]).not.toBe(mockBankDeposit.mock.calls[1][2]);
});

test("未確認操作の読み込みに失敗したら、新規操作を止める", async () => {
  mockLoadPending.mockRejectedValueOnce(new Error("読み込み失敗"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/確認待ちの操作を読み込めませんでした/));
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "引き出し" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "残高と履歴を確認したので解除" })).toBeNull();
});

test("破損記録は自動で捨てず、履歴確認と明示的な解除の後に新規操作を再開する", async () => {
  mockLoadPending.mockRejectedValueOnce(new CorruptPendingBankOperationError()).mockResolvedValue(null);
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/残高と履歴を確認してから解除/));
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "引き出し" })).toBeDisabled();
  expect(mockDiscardCorrupt).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "取引履歴を確認" }));
  expect(router.push).toHaveBeenCalledWith("/history");
  mockFetchUserBalance.mockResolvedValue(220);
  fireEvent.press(screen.getByRole("button", { name: "残高と履歴を確認したので解除" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  expect(mockDiscardCorrupt).toHaveBeenCalledWith(child.id);
  expect(screen.getByLabelText("現在の所持金")).toHaveTextContent("220 gol");
  expect(mockBankDeposit).not.toHaveBeenCalled();
  expect(mockBankWithdraw).not.toHaveBeenCalled();
  expect(mockClearPending).not.toHaveBeenCalled();
});

test("破損解除に失敗したら新規操作を止めたまま、解除を再試行できる", async () => {
  mockLoadPending.mockRejectedValueOnce(new CorruptPendingBankOperationError());
  mockDiscardCorrupt.mockRejectedValueOnce(new Error("削除失敗"));
  render(<BankScreen />);
  const button = await screen.findByRole("button", { name: "残高と履歴を確認したので解除" });
  fireEvent.press(button);
  await waitFor(() => expect(screen.getByText(/記録を解除できませんでした/)).toBeTruthy());
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "引き出し" })).toBeDisabled();
  expect(button).not.toBeDisabled();
  expect(mockBankDeposit).not.toHaveBeenCalled();
  fireEvent.press(button);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
});

test("破損解除時に別画面の正常な記録が見つかったら、そのIDでの確認へ戻す", async () => {
  const existing = { operationId: "19000000-0000-4000-8000-000000000008", userId: child.id, kind: "deposit", amount: 80 };
  mockLoadPending.mockRejectedValueOnce(new CorruptPendingBankOperationError()).mockResolvedValue(existing);
  render(<BankScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "残高と履歴を確認したので解除" }));
  await screen.findByRole("button", { name: "操作の結果を確認" });
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  expect(mockClearPending).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(mockBankDeposit).toHaveBeenCalledWith(child.id, 80, existing.operationId));
  expect(mockCreateOperationId).not.toHaveBeenCalled();
});

test("破損解除後の再読み込みに失敗したら、新規操作を再開しない", async () => {
  mockLoadPending.mockRejectedValueOnce(new CorruptPendingBankOperationError())
    .mockRejectedValueOnce(new Error("読み込み失敗"));
  render(<BankScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "残高と履歴を確認したので解除" }));
  await screen.findByText(/記録を解除できませんでした/);
  expect(screen.getByRole("button", { name: "預入" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "引き出し" })).toBeDisabled();
  expect(mockBankDeposit).not.toHaveBeenCalled();
});

test("別画面に先に保存された操作があれば、新しいIDを送らず確認待ちを復元する", async () => {
  const existing = { operationId: "19000000-0000-4000-8000-000000000007", userId: child.id, kind: "withdraw", amount: 80 };
  mockLoadPending.mockResolvedValueOnce(null).mockResolvedValue(existing);
  mockSavePending.mockRejectedValueOnce(new Error("別操作が確認待ち"));
  render(<BankScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "預入" })).not.toBeDisabled());
  fireEvent.press(screen.getByRole("button", { name: "預入" }));
  fireEvent.changeText(screen.getByLabelText("金額"), "100");
  fireEvent.press(screen.getByRole("button", { name: "預入を確定" }));
  await waitFor(() => expect(screen.getByText("引き出し 80 gol の結果が確認待ちです。")).toBeTruthy());
  expect(mockBankDeposit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "操作の結果を確認" }));
  expect(screen.getByLabelText("金額").props.value).toBe("80");
});
