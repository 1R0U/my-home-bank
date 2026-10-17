/**
 * 日本時間（UTC+9）の日付計算をまとめる。
 *
 * 連続記録・アプリを開いた日・家事をしなくていい日は、どれもDBが日本時間で日を区切っている。
 * アプリ側で同じ計算をあちこちに書くと少しずつずれるので、ここに1つだけ置く（PR #420 のレビュー）。
 */

/** 日本時間（UTC+9）のずれ（ミリ秒） */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 1日（ミリ秒） */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * その時刻の日本時間の日付を返す。
 * @param now - 時刻
 * @returns `YYYY-MM-DD`
 */
export function jstDate(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 日付（`YYYY-MM-DD`）に日数を足す。時差に関係なく、暦の上で数える。
 * @param day - `YYYY-MM-DD`
 * @param days - 足す日数（負なら引く）
 * @returns `YYYY-MM-DD`
 */
export function addDaysToDate(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
