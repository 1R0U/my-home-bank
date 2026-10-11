// かざるメニューで装飾の絵を出すときの、絵の種類を決める（描画に依存しない純粋な計算）。
//
// 絵は装飾ごとではなく、種類ごとに1つ持つ。「たかいき」「わかぎ」はどちらも木の絵になる。

/** かざるメニューで出す絵の種類。 */
export type DecorationIconKind = "bush" | "flowerbed" | "grass" | "hanger" | "lamp" | "rock" | "tree";

/**
 * アセットIDの頭の部分と、絵の種類の対応。上から順に見て、最初に当たったものを使う。
 * `decoration-bush-berry` のような派生は、頭が同じなので同じ絵になる。
 */
const ICON_PREFIXES: readonly (readonly [string, DecorationIconKind])[] = [
  ["decoration-tree", "tree"],
  ["decoration-bush", "bush"],
  ["decoration-flowerbed", "flowerbed"],
  ["decoration-grass", "grass"],
  ["decoration-rock", "rock"],
  ["decoration-lamp", "lamp"],
  ["decoration-hanger", "hanger"],
];

/**
 * 装飾のアセットIDから、かざるメニューに出す絵の種類を求める。
 * @param assetId - 装飾のアセットID
 * @returns 絵の種類。対応する絵が無ければ null（名前だけを出す）
 */
export function getDecorationIconKind(assetId: string): DecorationIconKind | null {
  for (const [prefix, kind] of ICON_PREFIXES) {
    if (assetId === prefix || assetId.startsWith(`${prefix}-`)) return kind;
  }
  return null;
}
