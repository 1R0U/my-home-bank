/**
 * 家庭の暦（何日・何月として数えるか）の基準（Issue #273）。
 *
 * **日本時間（UTC+9）に固定する。** 端末のタイムゾーンに従うと、同じ家族でも端末ごとに
 * 「今日」がずれる。家族は同じ場所に住む前提なので、1つに決めておく。
 *
 * 日本には夏時間が無いので、UTC から一定の時間をずらすだけで正確に日本時間になる。
 * `Intl` のタイムゾーン指定は端末の JavaScript エンジン（Hermes）の対応状況に左右されるため使わない。
 */
export const FAMILY_UTC_OFFSET_HOURS = 9;

const OFFSET_MS = FAMILY_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * 日時を、家庭の暦（日本時間）の年月日で読めるようにずらす。
 *
 * 戻り値は **`getUTC*` 系で読む**（`getUTCFullYear` / `getUTCMonth` / `getUTCDate` / `getUTCDay`）。
 * ずらした後の値なので、`getFullYear` などのローカル時刻の読み方をすると端末のタイムゾーンぶん
 * さらにずれる。時刻そのもの（何時何分に起きたか）として使ってはいけない。
 * @param isoDate - ISO形式の日時文字列（DB の `created_at` など。UTC）
 * @returns 日本時間の年月日を `getUTC*` で読める Date
 */
export function toFamilyCalendarDate(isoDate: string): Date {
  return new Date(new Date(isoDate).getTime() + OFFSET_MS);
}
