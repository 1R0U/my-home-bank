// node --test から直接読み込まれるため、拡張子まで指定する
// （historyUtils.ts と同じ流儀）
import { classifyCashFlow, type CashFlowClass } from "../../lib/transactionClassification.ts";
import type { Transaction } from "../../types";
import { formatShortPeriodLabel, getPeriodKey, type HistoryGranularity } from "./historyUtils.ts";

/**
 * 大人用・子供用の履歴画面で共有する、表示のための小さな関数（Issue #438）。
 * 見た目（色・文言のふりがな）は画面ごとに違うので、ここには置かない。
 */

const GRANULARITY_ORDER: HistoryGranularity[] = ["day", "week", "month", "year"];

export const GRANULARITY_LABELS: Record<HistoryGranularity, string> = {
  day: "日",
  week: "週",
  month: "月",
  year: "年",
};

/**
 * 次に切り替える集計の粒度を返す（日→週→月→年→日の順に循環する）。
 * @param current - 現在の粒度
 * @returns 次の粒度
 */
export function nextGranularity(current: HistoryGranularity): HistoryGranularity {
  const index = GRANULARITY_ORDER.indexOf(current);
  return GRANULARITY_ORDER[(index + 1) % GRANULARITY_ORDER.length];
}

/**
 * 取引履歴の一覧に出す日付ラベルを作る（例: "8/2"）。
 * @param isoDate - ISO形式の日時文字列
 * @returns 月日の短縮ラベル
 */
export function formatTransactionDate(isoDate: string): string {
  return formatShortPeriodLabel(getPeriodKey(isoDate, "day"), "day");
}

/**
 * 取引を新しい順に並べた配列を返す（元の配列は変えない）。
 * @param transactions - 取引の一覧
 * @returns 新しい順に並べ替えた取引の一覧
 */
export function sortTransactionsNewestFirst(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}

/** 金額の色分け。`neutral` は振替と未知の種別 */
export type AmountTone = Exclude<CashFlowClass, "transfer"> | "neutral";

/**
 * 金額の色分けに使う分類を返す。
 * 振替（預入・引き出し・借り入れ・返済）と未知の種別は、収入・支出と取り違えないよう
 * 中立色で出すため `neutral` にまとめる。符号（＋−）は財布の増減としてそのまま表示する（Issue #143）。
 */
export function amountTone(transactionType: string): AmountTone {
  const cashFlowClass = classifyCashFlow(transactionType);

  if (cashFlowClass === "income" || cashFlowClass === "expense") return cashFlowClass;
  return "neutral";
}

/**
 * 読み上げ用に、振替であることを補う語を返す。
 * 収入・支出との違いを色だけで表すと読み上げでは伝わらないため、文言でも区別する。
 */
export function amountSuffixLabel(transactionType: string): string {
  return classifyCashFlow(transactionType) === "transfer" ? "（振替）" : "";
}

/**
 * 金額に符号を付ける（プラスのときだけ "+" を足す。マイナスは数値側に付いている）。
 * @param amount - 金額
 * @returns 符号の文字列（"+" または ""）
 */
export function amountSign(amount: number): string {
  return amount >= 0 ? "+" : "";
}
