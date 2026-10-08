/** 銀行RPCの取引額は内部でintegerへ変換するため、1回の操作にはこの上限を適用する。 */
export const MAX_BANK_OPERATION_AMOUNT = 2_147_483_647;

/** 銀行の新規操作で受け付ける、DB上限以内の正の整数かを返す。 */
export function isValidBankOperationAmount(amount: number | null): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_BANK_OPERATION_AMOUNT;
}

/**
 * 入力文字列を正の整数の金額としてパースする。
 * 数値でない・0以下・小数の場合は null を返す。
 */
export function parseAmountInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isSafeInteger(amount)) return null;
  return amount;
}

/** 残高に小数があっても、入力可能額は上限以内の0以上の整数にする。 */
export function getAmountInputLimit(balance: number, cap = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(balance)) return 0;
  return Math.max(0, Math.floor(Math.min(balance, cap)));
}

/** 入力を別の金額へ変換せず、無効な理由を日本語で返す。未入力時は表示しない。 */
export function getAmountInputError(text: string, maximum: number, limitMessage: string): string | null {
  if (!text.trim()) return null;
  const amount = parseAmountInput(text);
  if (amount === null) return "金額は1以上の整数で入力してください。";
  return amount > maximum ? limitMessage : null;
}

/** 預入できるか（ライブ接続中・金額が有効・所持金が足りている場合のみ）。 */
export function canDeposit(amount: number | null, walletBalance: number, isLive: boolean): boolean {
  return isLive && isValidBankOperationAmount(amount) && amount <= walletBalance;
}

/** 引き出せるか（ライブ接続中・金額が有効・預金残高が足りている場合のみ）。 */
export function canWithdraw(amount: number | null, depositBalance: number, isLive: boolean): boolean {
  return isLive && isValidBankOperationAmount(amount) && amount <= depositBalance;
}
