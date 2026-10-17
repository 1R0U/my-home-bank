import { useCallback, useMemo, useState } from "react";
import { useTransactions } from "../../lib/useTransactions";
import { useTravelArrival } from "../../lib/useTravelArrival";
import { nextGranularity, sortTransactionsNewestFirst } from "./historyDisplay";
import { buildCumulativeSeries, groupTransactionsByPeriod, type HistoryGranularity } from "./historyUtils";

/**
 * 履歴画面の取得と集計をまとめたフック（Issue #438）。
 *
 * 大人用（`AdultHistoryScreen`）と子供用（`ChildHistoryScreen`）は見た目だけが違い、
 * 出す取引・グラフの集計・粒度の切り替えは同じなので、ここで1つにまとめる。
 */
export function useHistoryView() {
  const [granularity, setGranularity] = useState<HistoryGranularity>("month");
  // 他タブでの操作（クエスト承認等）による新しい取引は、フォーカスが戻ったときに取り直す（Issue #204）。
  const { transactions, loading, hasData, error, reload } = useTransactions();
  // 最初の取得中は、グラフと一覧の代わりに読み込み中の表示を出す。取り直しの間は、出ている履歴を残す
  const showLoading = loading && !hasData;
  // 我が家タウンから入ってきたときは、読み込み中の間「いどうちゅう」の画面を出しておく（Issue #261）
  useTravelArrival(!showLoading);

  const sortedTransactions = useMemo(() => sortTransactionsNewestFirst(transactions), [transactions]);

  const periods = useMemo(
    () => groupTransactionsByPeriod(sortedTransactions, granularity),
    [sortedTransactions, granularity],
  );

  const cumulativeSeries = useMemo(() => buildCumulativeSeries(periods), [periods]);

  const cycleGranularity = useCallback(() => setGranularity((current) => nextGranularity(current)), []);

  return {
    cumulativeSeries,
    cycleGranularity,
    errorMessage: error,
    granularity,
    periods,
    reload,
    showLoading,
    sortedTransactions,
  };
}
