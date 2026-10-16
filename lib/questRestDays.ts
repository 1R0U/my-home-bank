import { addDaysToDate } from "./jstDate.ts";

/**
 * 家事をしなくていい日（Issue #396）。
 *
 * 親が、子供ごとに「この日は家事をしなくていい」と決める。その日はタスクをしなくても
 * 連続記録が途切れない。タスクをしたら、ふつうの日と同じく数える（やってもやらなくてもいい日）。
 * 数えるのはDB（`private.quest_streak_counting`）で、ここには画面で使う日付の決まりだけを置く。
 *
 * 日付はすべて日本時間の `YYYY-MM-DD` で扱う。連続記録が日本時間で日を区切るため。
 */

/**
 * さかのぼって設定・取り消しできる日数。
 * **DBの `set_quest_rest_days` の `c_max_past_days` と同じにすること。** ずれると、
 * 画面で選べるのに保存で断られる（または選べるはずの日が選べない）。
 */
export const REST_DAY_MAX_PAST_DAYS = 7;

/** 先の日付は何日後まで設定できるか（DBの `c_max_future_days` と同じ） */
export const REST_DAY_MAX_FUTURE_DAYS = 365;

/** 1回に選べる日数の上限（DBの `c_max_days` と同じ） */
export const REST_DAY_MAX_SELECTED_DAYS = 62;

/** `quest_rest_days` の1行のうち、画面で使うもの */
export type QuestRestDayRow = { user_id: string; rest_on: string };

/**
 * 設定・取り消しができる日付の範囲。
 * @param today - 日本時間の今日（`YYYY-MM-DD`）
 * @returns 最初の日と最後の日
 */
export function restDayRange(today: string): { min: string; max: string } {
  return { max: addDaysToDate(today, REST_DAY_MAX_FUTURE_DAYS), min: addDaysToDate(today, -REST_DAY_MAX_PAST_DAYS) };
}

/**
 * その日を選べるか（さかのぼれる範囲・先の範囲に入っているか）。
 * @param day - `YYYY-MM-DD`
 * @param today - 日本時間の今日
 */
export function isSelectableRestDay(day: string, today: string): boolean {
  const { min, max } = restDayRange(today);
  return day >= min && day <= max;
}

/**
 * 月のカレンダーを、日曜はじまりの週ごとに並べる。月の外のマスは null。
 * @param year - 年
 * @param month - 月（1〜12）
 * @returns 週ごとの7マス
 */
export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let date = 1; date <= daysInMonth; date += 1) {
    cells.push(new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 月を前後に動かす。
 * @param ym - 年と月（1〜12）
 * @param delta - 動かす月数
 */
export function shiftMonth(ym: { year: number; month: number }, delta: number): { year: number; month: number } {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

/**
 * 日付ごとに、お休みにしている子供のidをまとめる。
 * @param rows - `quest_rest_days` の行
 * @returns 日付 → 子供のid
 */
export function groupRestDaysByDate(rows: readonly QuestRestDayRow[]): Map<string, Set<string>> {
  const byDate = new Map<string, Set<string>>();
  for (const row of rows) {
    const users = byDate.get(row.rest_on) ?? new Set<string>();
    users.add(row.user_id);
    byDate.set(row.rest_on, users);
  }
  return byDate;
}

/**
 * 選んだ子供・日付の組み合わせが、いまどうなっているか。
 *
 * ボタンを出し分けるのに使う。全部お休みなら「やめる」だけ、どれもお休みでなければ
 * 「お休みにする」だけ、混ざっていれば両方を押せるようにする。
 * @param byDate - `groupRestDaysByDate` の結果
 * @param userIds - 選んだ子供
 * @param days - 選んだ日付
 * @returns 選んだ組み合わせのうち、お休みのものとそうでないものがあるか
 */
export function describeSelection(
  byDate: ReadonlyMap<string, ReadonlySet<string>>,
  userIds: readonly string[],
  days: readonly string[],
): { hasRest: boolean; hasWorkday: boolean } {
  let hasRest = false;
  let hasWorkday = false;
  for (const day of days) {
    for (const userId of userIds) {
      if (byDate.get(day)?.has(userId)) hasRest = true;
      else hasWorkday = true;
    }
  }
  return { hasRest, hasWorkday };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 日付を「5月20日（水）」の形にする。
 * @param day - `YYYY-MM-DD`
 */
export function formatRestDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日（${WEEKDAYS[date.getUTCDay()]}）`;
}
