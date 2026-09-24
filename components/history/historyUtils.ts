// node --test から直接読み込まれるため、拡張子まで指定する
// （lib/rpg-hub/buildingParts.ts と同じ流儀）
import { classifyCashFlow } from "../../lib/transactionClassification.ts";
import type { Transaction } from "../../types";

export type HistoryGranularity = "day" | "week" | "month" | "year";

export type PeriodSummary = {
  key: string;
  label: string;
  shortLabel: string;
  income: number;
  expense: number;
};

export type CumulativePoint = {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
};

/** 1日のミリ秒数 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ISO週番号を取得する（ISO 8601方式：木曜日を含む週が第1週）。
 * created_at はUTCのISO文字列のため、ローカルタイムゾーンに依存しないようUTCのgetterで統一する。
 * @param date - 週番号を取得する日付
 * @returns 年と週番号
 */
function getIsoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // 月曜=0 ... 日曜=6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // その週の木曜日へ
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return { year: target.getUTCFullYear(), week };
}

/**
 * 日付から期間キーを生成する（粒度に応じて年/月/週/日のキーを返す）。
 * @param isoDate - ISO形式の日付文字列
 * @param granularity - 粒度（year/month/week/day）
 * @returns 期間キー（例: "2026", "2026-07", "2026-W30", "2026-07-15"）
 */
export function getPeriodKey(isoDate: string, granularity: HistoryGranularity): string {
  const date = new Date(isoDate);

  if (granularity === "year") {
    return `${date.getUTCFullYear()}`;
  }

  if (granularity === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  if (granularity === "day") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate(),
    ).padStart(2, "0")}`;
  }

  const { year, week } = getIsoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * 期間キーから完全な日本語ラベルを生成する。
 * @param key - 期間キー
 * @param granularity - 粒度
 * @returns 日本語ラベル（例: "2026年7月15日"）
 */
export function formatPeriodLabel(key: string, granularity: HistoryGranularity): string {
  if (granularity === "year") {
    return `${key}年`;
  }

  if (granularity === "month") {
    const [year, month] = key.split("-");
    return `${year}年${Number(month)}月`;
  }

  if (granularity === "day") {
    const [year, month, day] = key.split("-");
    return `${year}年${Number(month)}月${Number(day)}日`;
  }

  const [year, week] = key.split("-W");
  return `${year}年 第${Number(week)}週`;
}

/**
 * 期間キーから短縮版のラベルを生成する（チャート表示用）。
 * @param key - 期間キー
 * @param granularity - 粒度
 * @returns 短縮ラベル（例: "7/15"）
 */
export function formatShortPeriodLabel(key: string, granularity: HistoryGranularity): string {
  if (granularity === "year") {
    return key;
  }

  if (granularity === "month") {
    const [, month] = key.split("-");
    return `${Number(month)}月`;
  }

  if (granularity === "day") {
    const [, month, day] = key.split("-");
    return `${Number(month)}/${Number(day)}`;
  }

  const [, week] = key.split("-W");
  return `W${Number(week)}`;
}

/**
 * 期間キーから西暦（4桁）を抽出する。
 * 期間キーは常に4桁の西暦から始まる（YYYY / YYYY-MM / YYYY-MM-DD / YYYY-Wnn）。
 * @param key - 期間キー
 * @returns 西暦文字列（4桁）
 */
function getPeriodYear(key: string): string {
  return key.slice(0, 4);
}

/**
 * トランザクションをユーザーIDでフィルタリングする。
 * @param transactions - フィルタ対象のトランザクション配列
 * @param userId - フィルタするユーザーID
 * @returns 指定ユーザーのトランザクションのみの配列
 */
export function filterTransactionsByUser(transactions: Transaction[], userId: string): Transaction[] {
  return transactions.filter((transaction) => transaction.user_id === userId);
}

/**
 * トランザクションを期間ごとにグループ化し、収入と支出を集計する。
 *
 * 収入・支出の判定には金額の符号ではなく、取引種別の分類
 * （`lib/transactionClassification.ts`）を使う。符号で判定すると、財布から
 * 預金へ移しただけの預入（金額が負）まで支出として数えてしまうため（Issue #143）。
 *
 * 振替（預入・引き出し・借り入れ・返済）と、分類できない未知の種別は、
 * 収入にも支出にも数えない。
 *
 * @param transactions - 集計対象のトランザクション配列
 * @param granularity - 集計の粒度
 * @returns 期間ごとの収入・支出サマリー配列（期間キーでソート済み）
 */
export function groupTransactionsByPeriod(
  transactions: Transaction[],
  granularity: HistoryGranularity,
): PeriodSummary[] {
  const summaries = new Map<string, PeriodSummary>();
  const years = new Set<string>();

  for (const transaction of transactions) {
    const key = getPeriodKey(transaction.created_at, granularity);
    years.add(getPeriodYear(key));

    const summary = summaries.get(key) ?? {
      key,
      label: formatPeriodLabel(key, granularity),
      shortLabel: formatShortPeriodLabel(key, granularity),
      income: 0,
      expense: 0,
    };

    const cashFlowClass = classifyCashFlow(transaction.type);

    if (cashFlowClass === "income") {
      summary.income += transaction.amount;
    } else if (cashFlowClass === "expense") {
      // 支出の金額は財布が減る向き（負）で記帳されているため、符号を反転して足す。
      summary.expense += -transaction.amount;
    }
    // transfer と未知の種別（null）は、収入にも支出にも数えない。
    // ただし期間自体は集計対象に含め、取引のあった期間がグラフから消えないようにする。

    summaries.set(key, summary);
  }

  const periods = Array.from(summaries.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  if (granularity === "year" || years.size <= 1) {
    return periods;
  }

  // 複数年にまたがる場合、月/週/日の短縮ラベルだけでは年をまたいで重複するため西暦下2桁を補う
  return periods.map((period) => ({
    ...period,
    shortLabel: `'${getPeriodYear(period.key).slice(2)}/${period.shortLabel}`,
  }));
}

/**
 * 期間ごとのサマリーから累積残高の系列を生成する。
 *
 * 振替は収入にも支出にも含まれないため、この累積値は
 * 「財布 + 預金 − 借金」（そのユーザーが保有する家庭内通貨の総量）の推移を表す。
 * 預入や借り入れをしただけでは上下しない（Issue #143）。
 *
 * なお、取得した取引履歴の範囲の合計であり、履歴より前の残高は含まない。
 *
 * @param periods - 期間ごとの収入・支出サマリー配列
 * @returns 累積残高の系列（各期間終了時点の残高を含む）
 */
export function buildCumulativeSeries(periods: PeriodSummary[]): CumulativePoint[] {
  let balance = 0;

  return periods.map((period) => {
    balance += period.income - period.expense;
    return { key: period.key, label: period.label, shortLabel: period.shortLabel, balance };
  });
}
