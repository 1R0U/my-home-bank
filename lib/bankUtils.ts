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
  return amount;
}

/** 預入できるか（ライブ接続中・金額が有効・所持金が足りている場合のみ）。 */
export function canDeposit(amount: number | null, walletBalance: number, isLive: boolean): boolean {
  return isLive && amount !== null && amount > 0 && amount <= walletBalance;
}

/** 引き出せるか（ライブ接続中・金額が有効・預金残高が足りている場合のみ）。 */
export function canWithdraw(amount: number | null, depositBalance: number, isLive: boolean): boolean {
  return isLive && amount !== null && amount > 0 && amount <= depositBalance;
}

/** 借り入れできるか（ライブ接続中・金額が有効な場合のみ。上限は設けない）。 */
export function canBorrow(amount: number | null, isLive: boolean): boolean {
  return isLive && amount !== null && amount > 0;
}

/** 返済できるか（ライブ接続中・金額が有効・所持金と借入残高の両方が足りている場合のみ）。 */
export function canRepay(
  amount: number | null,
  walletBalance: number,
  loanBalance: number,
  isLive: boolean,
): boolean {
  return (
    isLive &&
    amount !== null &&
    amount > 0 &&
    amount <= walletBalance &&
    amount <= loanBalance
  );
}
