import { assertSafeGol } from "./treasury.ts";
import { toFamilyCalendarDate } from "./familyTime.ts";

/** 金庫比率の境界を浮動小数点の丸めなしで判定する。 */
export function savingsMonthlyRate(balance: number, totalSupply: number): number {
  assertSafeGol(balance, "金庫残高");
  assertSafeGol(totalSupply, "家庭総ゴル");
  if (balance > totalSupply) throw new Error("金庫残高が家庭総ゴルを超えています");
  if (totalSupply === 0) return 0;
  const numerator = BigInt(balance) * 100n;
  const supply = BigInt(totalSupply);
  if (numerator >= supply * 50n) return 0.01;
  if (numerator >= supply * 30n) return 0.005;
  if (numerator >= supply * 20n) return 0.0025;
  return 0;
}

/** 29〜31日を指定した月にその日がなければ、月末を積立日とする。 */
export function savingsDueDate(month: string, day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("積立日は1〜31で指定してください");
  }
  const match = /^(\d{4})-(\d{2})-01$/.exec(month);
  if (!match || Number(match[1]) < 1000 || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error("対象月が不正です");
  }
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function savingsCalendarMonth(at: string): string {
  const date = toFamilyCalendarDate(at);
  if (!Number.isFinite(date.getTime())) throw new Error("日時が不正です");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function parseSavingsAmount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const amount = Number(text.trim());
  return Number.isSafeInteger(amount) ? amount : null;
}
