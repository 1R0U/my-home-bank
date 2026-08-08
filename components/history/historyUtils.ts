import type { Transaction } from "../../types";

export type HistoryGranularity = "week" | "month" | "year";

export type PeriodSummary = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getIsoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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
    return `${date.getFullYear()}`;
  }

  if (granularity === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

  const [year, week] = key.split("-W");
  return `${year}年 第${Number(week)}週`;
}

export function groupTransactionsByPeriod(
  transactions: Transaction[],
  granularity: HistoryGranularity,
): PeriodSummary[] {
  const summaries = new Map<string, PeriodSummary>();

  for (const transaction of transactions) {
    const key = getPeriodKey(transaction.created_at, granularity);
    const summary = summaries.get(key) ?? {
      key,
      label: formatPeriodLabel(key, granularity),
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

  return Array.from(summaries.values()).sort((a, b) => (a.key > b.key ? 1 : -1));
}
