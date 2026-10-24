// 我が家タウンに最初からある飾り（木・岩・花壇・低木・草むら・街灯と、町の外へ散らした自然物）を、
// かざるの編集モードで動かす・回す・しまう（Issue #509）。
//
// 配置は家の中の家具（houseFurniture.ts）と同じく、利用者ごとに house_furniture_layouts へ保存し、
// しまう操作も同じDBの関数 store_house_furniture を使う。しまうと、同じ見た目の装飾（オブジェクトの
// `model` のアセット）が持ち物に1つ入る。どの飾りをしまえるかと入る装飾は、DBの house_furniture_items と
// 同じにする（mapObjects.ts の TOWN_DECORATION_ASSETS。ずれはテストが検出する）。
//
// 建物・道・柵の外の森と茂みは対象外（町の骨組みと、歩いて行けない場所の飾り）。
//
// WebView のシーン（タップした物が選べるかの判定）からも使うので、mapObjects.ts を読み込まない。
// そのため、どれが町の飾りかは id の形で見分ける。mapObjects.ts の一覧と同じになることはテストで確かめる。

import { snapDecorationToCells, snapRotationToQuarter } from "./townGrid.ts";
import type { MapObject } from "../../types/map";

/**
 * 最初からある町の飾りの id の形。手で置いた物は種類の名前で始まり（`tree-north` など）、
 * 散らした物は `scatter-{種類の番号}-{番号}`。
 */
const TOWN_DECORATION_ID_PATTERN = /^(?:(?:lamp|flowerbed|bush|tree|grass|rock)-[a-z-]+|scatter-\d+-\d+)$/;

/**
 * 最初からある町の飾りの id か。
 * @param id - マップ上のオブジェクトid
 * @returns 町の飾りなら true
 */
export function isTownDecorationId(id: string): boolean {
  return TOWN_DECORATION_ID_PATTERN.test(id);
}

/**
 * 町の飾りを、点にいちばん近いマスへ、指定した向きで置き直したものを作る。
 *
 * **拡大率と高さは変えない。** 町の飾りは同じ形が並んで見えないよう1つずつ大きさを変えてあり
 * （マスからはみ出さない大きさまで）、動かしても同じ大きさのまま見せる。
 * 置いた装飾と同じく、占めるマスは正方形なので、向きを変えても占めるマスは変わらない。
 * @param object - 町の飾り（最初の位置のもの）
 * @param point - 置きたい点
 * @param rotationY - 向き（90度刻みへ寄せる）
 * @returns 置き直した飾り。装飾でなければ元のまま
 */
export function placeTownDecorationAt<T extends MapObject>(object: T, point: { x: number; z: number }, rotationY: number): T {
  const snapped = snapDecorationToCells(object.model, point.x, point.z);
  if (!snapped) return object;
  return {
    ...object,
    position: { ...object.position, x: snapped.x, z: snapped.z },
    rotationY: snapRotationToQuarter(rotationY),
  };
}
