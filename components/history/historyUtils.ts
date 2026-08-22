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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// created_at はUTCのISO文字列のため、ローカルタイムゾーンに依存しないようUTCのgetterで統一する
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

// 期間キーは常に4桁の西暦から始まる（YYYY / YYYY-MM / YYYY-MM-DD / YYYY-Wnn）
function getPeriodYear(key: string): string {
  return key.slice(0, 4);
}

export function filterTransactionsByUser(transactions: Transaction[], userId: string): Transaction[] {
  return transactions.filter((transaction) => transaction.user_id === userId);
}

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

    if (transaction.amount >= 0) {
      summary.income += transaction.amount;
    } else {
      summary.expense += Math.abs(transaction.amount);
    }

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

export function buildCumulativeSeries(periods: PeriodSummary[]): CumulativePoint[] {
  let balance = 0;

  return periods.map((period) => {
    balance += period.income - period.expense;
    return { key: period.key, label: period.label, shortLabel: period.shortLabel, balance };
  });
}
