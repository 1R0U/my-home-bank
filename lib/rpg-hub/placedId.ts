// 置いた装飾のオブジェクトID（Issue #223）。
//
// WebView のシーン（編集モードで、タップした物が置いた装飾かを見分ける。Issue #477）からも
// 使うので、mapObjects.ts を読み込む placedDecorations.ts から分けてある。

/**
 * 置いた装飾のオブジェクトIDにつける接頭辞。
 * 町の固定物（`building-bank` や `scatter-12` など）とぶつからないようにする。
 */
export const PLACED_ID_PREFIX = "placed-";

/**
 * 「かざる」で置いた装飾のidか。町の固定物（建物・道・散らした木）は動かせない。
 * @param id - マップ上のオブジェクトid
 * @returns 置いた装飾なら true
 */
export function isPlacedDecorationId(id: string): boolean {
  return id.startsWith(PLACED_ID_PREFIX);
}
