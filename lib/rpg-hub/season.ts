import type { Season } from "../../types/map";

// 季節を「決める」処理だけを置く。季節ごとの見た目（色・照明・飾り）は
// lib/rpg-hub/seasonalLook.ts が持つ（docs/RPG_HUB_ARCHITECTURE.md 7章）。
// 決め方と見た目を分けておくと、アプリ内イベントで季節を決めるようにしても
// 見た目の側は触らずに済む。

/** 各季節が始まる月（0始まり）。春・夏・秋・冬の順。 */
const SEASON_START_MONTHS = [2, 5, 8, 11];

/**
 * 日付から季節を判定する（RPGハブの表示用）。
 * 既存コードに季節判定はないため、RPGハブ固有の表示ロジックとして分離。
 * @param date - 判定する日付
 * @returns 春（3〜5月）、夏（6〜8月）、秋（9〜11月）、冬（12〜2月）
 */
export function getSeason(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/**
 * 次に季節が変わる瞬間（端末の時刻で、その月の1日 0時）までのミリ秒を返す。
 *
 * アプリを開いたまま季節が変わったときに、切り替えるタイマーの待ち時間に使う（Issue #282）。
 * @param date - 基準の日時
 * @returns 次の季節の始まりまでのミリ秒（正の値）
 */
export function msUntilNextSeason(date: Date): number {
  const month = date.getMonth();
  const nextStart = SEASON_START_MONTHS.find((startMonth) => startMonth > month);
  const next =
    nextStart === undefined
      ? new Date(date.getFullYear() + 1, SEASON_START_MONTHS[0], 1)
      : new Date(date.getFullYear(), nextStart, 1);
  return next.getTime() - date.getTime();
}
