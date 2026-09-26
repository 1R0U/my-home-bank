/** 家庭内通貨の正式な単位表記（Issue #297）。 */
export const GOL_UNIT = "gol";

/** 読み上げや日本語の文章で使う家庭内通貨の正式名称。 */
export const GOL_NAME = "ゴル";

/** コイン風UIに表示する装飾記号。通貨単位ではないため GOL_UNIT とは分けて管理する。 */
export const GOL_COIN_MARK = "G";

/**
 * 金額に桁区切りを入れる（単位は付けない）。
 * @param amount - 金額
 * @returns 桁区切りを入れた文字列（例: "1,000"）
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/** 画面表示用に金額と正式単位を整える（例: "1,000 gol"）。 */
export function formatGol(amount: number): string {
  return `${formatAmount(amount)} ${GOL_UNIT}`;
}

/** 読み上げ用に金額と正式名称を整える（例: "1,000ゴル"）。 */
export function formatGolForSpeech(amount: number): string {
  return `${formatAmount(amount)}${GOL_NAME}`;
}
