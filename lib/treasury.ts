export type TreasuryBalanceInput = {
  balance: number;
  totalSupply: number;
  minimumReserveRate: number;
};

export function assertSafeHmc(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}は0以上の安全な整数で指定してください`);
  }
}

export function assertPositiveSafeHmc(value: number, label: string): void {
  assertSafeHmc(value, label);
  if (value === 0) {
    throw new Error(`${label}は1以上の安全な整数で指定してください`);
  }
}

export function assertMinimumReserveRate(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("最低準備金率は0〜1で指定してください");
  }
}

export function calculateMinimumReserve(totalSupply: number, minimumReserveRate: number): number {
  assertSafeHmc(totalSupply, "家庭総HMC");
  assertMinimumReserveRate(minimumReserveRate);

  const rateInBasisPoints = Math.round(minimumReserveRate * 10_000);
  return Number((BigInt(totalSupply) * BigInt(rateInBasisPoints)) / 10_000n);
}

export function calculateAvailableTreasuryBalance({
  balance,
  totalSupply,
  minimumReserveRate,
}: TreasuryBalanceInput): number {
  assertSafeHmc(balance, "ギルド金庫残高");
  if (balance > totalSupply) {
    throw new Error("ギルド金庫残高は家庭総HMC以下で指定してください");
  }
  const minimumReserve = calculateMinimumReserve(totalSupply, minimumReserveRate);
  return Math.max(0, balance - minimumReserve);
}
