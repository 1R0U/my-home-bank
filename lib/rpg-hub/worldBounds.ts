// 我が家タウン（町）の広さと、その境界（Issue #194）。
//
// **歩ける範囲の判定（movement.ts）・置ける範囲の判定（placement.ts）・境界の見た目
// （mapObjects.ts の柵と森、webview/rpg-hub/scene.ts の海と砂浜）は、すべてここから値を取る。**
// 以前は歩ける範囲（`MAP_LIMIT = 6`）と地面の大きさを別々に持っていて、見えない壁で
// 止まる不具合になっていた。別々に定義し直さないこと。
//
// 形は原点を中心にした正方形。北（+Z）の1辺は海、残りの3辺は柵で囲む。
// カメラはプレイヤーの +X+Z 側から見下ろしているので（townCamera.ts）、
//   - 奥に映る西（-X）・南（-Z）は、柵の外に背の高い森を置いて背景にする
//   - 手前に映る東（+X）は、背の高い物がプレイヤーを隠すので、低い茂みだけにする
//   - 手前に映るもう1辺の北（+Z）は、平らで何も隠さない海にする
//
// 家の中（houseInterior.ts の HOUSE_ROOM_CENTER など）は、この範囲の外にある別の場所で、
// テレポートで出入りする。範囲の外は町ではないので、ここの判定は掛けない。
//
// プレイヤーが立てる範囲（境界から当たり判定の半径ぶん内側）は movement.ts の
// `WALKABLE_BOUNDS`。半径が movement.ts にあり、こちらから読み込むと循環するため。

/**
 * 町の中心から境界（柵・波打ちぎわ）までの距離。町は一辺 `WORLD_HALF * 2` の正方形。
 *
 * 決め方（Issue #194）:
 *   - 家族は最大8人を想定。1人1軒の家（#244）を 6×6 の区画で4軒×2列に並べると約24×14になり、
 *     町の中心（±13 × ±15）の南に住宅街として置ける
 *   - 自然物を散らす範囲（mapObjects.ts の SCATTER_HALF = 34）のすぐ外に境界が来る
 *   - カメラに映るのはプレイヤーの周り ±12 くらいなので、これより広げても何もない場所が増えるだけ
 *   - `placed_decorations` の座標の制約（±100）と、家の中（z = -76 付近）には届かない
 */
export const WORLD_HALF = 40;

/** 海と砂浜の境目（波打ちぎわ）のZ座標。北（+Z）の境界そのもの。 */
export const SHORE_Z = WORLD_HALF;

/** 砂浜の幅。草地から波打ちぎわまで。 */
export const BEACH_DEPTH = 4;

/**
 * 砂浜と海の色。季節では変えない。
 * 3Dの地面（webview/rpg-hub/scene.ts）とマップ（lib/rpg-hub/minimap.ts）の両方で使う。
 * `surf` は波打ちぎわの白い帯で、砂浜と海の境目を見やすくする。
 */
export const SHORE_COLORS = { sand: "#ead9a6", sea: "#4fa3d1", surf: "#e6f4fb" } as const;

/**
 * その座標が町の中（境界の内側）かを判定する。境界線の上も町に含める。
 *
 * 家の中は町の外にあるので false になる。範囲の判定を「町にいるときだけ」掛けるために使う。
 * @param x - X座標
 * @param z - Z座標
 * @returns 町の中なら true
 */
export function isInsideWorld(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_HALF && Math.abs(z) <= WORLD_HALF;
}
