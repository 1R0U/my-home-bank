// かざるメニューの並べ方を決める（描画に依存しない純粋な計算）。
//
// 装飾は種類（き・しげみ・くさ…）ごとにまとめて出し、種類を選んでから、その中の
// どれにするかを選ぶ2段にしている。全部を1列に並べると、似た名前・似た絵が続いて
// 選びにくかった。

/** かざるメニューで出す種類。絵もこの種類ごとに1つ持つ。 */
export type DecorationIconKind = "bush" | "flowerbed" | "grass" | "hanger" | "lamp" | "rock" | "tree";

/**
 * アセットIDの頭の部分と、種類の対応。上から順に見て、最初に当たったものを使う。
 * `decoration-bush-berry` のような派生は、頭が同じなので同じ種類になる。
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

/** 種類の名前。1段目に出す。子供が読むので漢字を使わない。 */
const KIND_LABELS: Record<DecorationIconKind, string> = {
  bush: "しげみ",
  flowerbed: "かだん",
  grass: "くさ",
  hanger: "ハンガー",
  lamp: "ランプ",
  rock: "いし",
  tree: "き",
};

/** かざるメニューの1段目に出す1つぶん。 */
export type DecorationGroup = {
  /** この種類に入る装飾のアセットID（元の並び順） */
  assetIds: string[];
  kind: DecorationIconKind;
  label: string;
};

/**
 * 装飾のアセットIDから、かざるメニューでの種類を求める。
 * @param assetId - 装飾のアセットID
 * @returns 種類。どれにも当たらなければ null
 */
export function getDecorationIconKind(assetId: string): DecorationIconKind | null {
  for (const [prefix, kind] of ICON_PREFIXES) {
    if (assetId === prefix || assetId.startsWith(`${prefix}-`)) return kind;
  }
  return null;
}

/**
 * 置ける装飾を種類ごとにまとめる。
 *
 * 種類の並びは、その種類の装飾が最初に出てくる順にする（カタログの順を崩さない）。
 * 種類が分からない装飾はまとめられないので外す。外れたことは
 * `tests/decorationMenu.test.mjs` が、置ける装飾がすべて種類を持つかで確かめている。
 * @param assetIds - 置ける装飾のアセットID
 * @returns 種類ごとのまとまり
 */
export function groupDecorations(assetIds: readonly string[]): DecorationGroup[] {
  const groups = new Map<DecorationIconKind, DecorationGroup>();
  for (const assetId of assetIds) {
    const kind = getDecorationIconKind(assetId);
    if (!kind) continue;
    const group = groups.get(kind);
    if (group) {
      group.assetIds.push(assetId);
    } else {
      groups.set(kind, { assetIds: [assetId], kind, label: KIND_LABELS[kind] });
    }
  }
  return [...groups.values()];
}
