/**
 * 金額の表示を整える（Issue #217）。
 *
 * 以前は `.toLocaleString("ja-JP")` が12箇所に手書きされ、単位も
 * `pt` / `PT` / `Pt` / `P` / `ポイント` と5種類に分かれていた。
 *
 * **どの表記に統一するかは決めていない。** [docs/domain-glossary.md](../docs/domain-glossary.md)
 * で「通貨の表記」は未確定の論点として残っている。子供用の画面が `P` / `Pt` を
 * 使っているのは世界観に合わせた意図的な使い分けの可能性があるため、ここでは揃えない。
 *
 * このファイルが引き受けるのは**数字の整形だけ**で、単位は呼び出し側が選ぶ。
 * 表記を決めたときに、直す場所がここ1か所で済む状態にしておくのが目的。
 */

/**
 * 単位の表記。**現時点で3種類が混在している。**
 *
 * 画面ごとに使い分けられており、統一するかは未確定（上記のとおり用語集の論点）。
 * どれを使うかは呼び出し側が選ぶ。統一すると決まったら、ここの値を変えれば済む。
 *
 * | 表記 | 使っている場所 |
 * | --- | --- |
 * | `pt` | 大人用の画面（ホーム・タスク・ストア・ローン・所持金） |
 * | `P` | 子供用ストア、履歴のグラフと一覧 |
 * | `ポイント` | 読み上げ用のラベル |
 *
 * 前後の空白は単位ではなくレイアウトなので、ここには含めず呼び出し側で入れる。
 */
export const AMOUNT_UNITS = {
  /** 例: 1,000pt */
  pt: "pt",
  /** 例: 1,000P */
  p: "P",
  /** 読み上げ用。例: 1,000ポイント */
  spoken: "ポイント",
} as const;

export type AmountUnit = (typeof AMOUNT_UNITS)[keyof typeof AMOUNT_UNITS];

/**
 * 金額に桁区切りを入れる（単位は付けない）。
 * @param amount - 金額
 * @returns 桁区切りを入れた文字列（例: "1,000"）
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/**
 * 金額に桁区切りと単位を付ける。
 * @param amount - 金額
 * @param unit - 付ける単位。`AMOUNT_UNITS` から選ぶ
 * @returns 単位付きの文字列（例: "1,000pt"）
 */
export function formatAmountWithUnit(amount: number, unit: AmountUnit): string {
  return `${formatAmount(amount)}${unit}`;
}
