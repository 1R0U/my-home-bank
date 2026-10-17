/**
 * 我が家タウンのマス（格子）（Issue #445）。
 *
 * 町を一辺0.9のマスで区切り、建物・道・装飾は「どのマスに置くか」で位置を決める。
 * 以前は1つずつ座標を直書きし、扉の正面に道が来るよう手で合わせていた。
 *
 * - マス (列 col, 行 row) は x が col × 0.9 〜 (col + 1) × 0.9、z が row × 0.9 〜 (row + 1) × 0.9 の範囲。
 *   出発地点(0, 0)はマスの角にあたる。
 * - +X が東（列が増える）、+Z が北（行が増える）。
 * - 何マスぶんを占めるかは物ごとに決まる（正方形）。位置は南西（列・行がいちばん小さい）のマスで指定する。
 *   - 装飾: 1マス（花壇と雪だまりは 2×2）。カタログの `placement.cells`
 *   - 道のタイル: 2×2
 *   - 建物: 4×4（`BUILDING_LOT_CELLS`）
 *
 * 家の中の床・壁・家具（Issue #444）はマスにそろえない。
 */

/**
 * マスの一辺。装飾1つぶん。
 * 道のタイル（一辺1.8）はちょうど 2×2 マスになる。
 */
export const TOWN_CELL_SIZE = 0.9;

/** 建物1棟が占めるマスの数（東西・南北とも）。全部の建物でそろえている。 */
export const BUILDING_LOT_CELLS = 4;

/** マスの番号。 */
export type TownCell = { col: number; row: number };

/** 浮動小数の誤差で、ちょうどマスの境目の値が隣のマスへ落ちないようにする幅。 */
const EPSILON = 1e-6;

/**
 * 南西のマスから東・北へ `cells` マスぶんの範囲を求める。
 * @param cell - 南西のマス
 * @param cells - 一辺のマス数
 * @returns XZ平面上の範囲
 */
export function getCellsBounds(
  cell: TownCell,
  cells: number,
): { maxX: number; maxZ: number; minX: number; minZ: number } {
  return {
    maxX: (cell.col + cells) * TOWN_CELL_SIZE,
    maxZ: (cell.row + cells) * TOWN_CELL_SIZE,
    minX: cell.col * TOWN_CELL_SIZE,
    minZ: cell.row * TOWN_CELL_SIZE,
  };
}

/**
 * 南西のマスから `cells` マスぶんを占める物の、中心の座標を求める。
 * @param cell - 南西のマス
 * @param cells - 一辺のマス数
 * @returns XZ座標
 */
export function getCellsCenter(cell: TownCell, cells: number): { x: number; z: number } {
  return {
    x: (cell.col + cells / 2) * TOWN_CELL_SIZE,
    z: (cell.row + cells / 2) * TOWN_CELL_SIZE,
  };
}

/**
 * 中心の座標から、`cells` マスぶんを占める物の南西のマスを求める。
 * 中心がマスにそろっていない座標は、いちばん近い置き方に寄せる。
 * @param x - 中心のX座標
 * @param z - 中心のZ座標
 * @param cells - 一辺のマス数
 * @returns 南西のマス
 */
export function getCellAt(x: number, z: number, cells: number): TownCell {
  // 0.5 ちょうどを東・北へ寄せると、負の側と正の側で寄り方が変わる。誤差ぶん足して揃える
  // `|| 0` は -0 を 0 にそろえる（Math.round(-0.4) は -0 になり、比べるときに紛らわしい）
  return {
    col: Math.round(x / TOWN_CELL_SIZE - cells / 2 + EPSILON) || 0,
    row: Math.round(z / TOWN_CELL_SIZE - cells / 2 + EPSILON) || 0,
  };
}

/**
 * 座標を、`cells` マスぶんを占める物として置ける、いちばん近い中心へ寄せる。
 * @param x - X座標
 * @param z - Z座標
 * @param cells - 一辺のマス数
 * @returns マスにそろえた中心の座標
 */
export function snapToCells(x: number, z: number, cells: number): { x: number; z: number } {
  return getCellsCenter(getCellAt(x, z, cells), cells);
}

/** 向きを寄せる単位（90度）。 */
const QUARTER_TURN = Math.PI / 2;

/**
 * 向きを、いちばん近い90度刻みへ寄せる。
 *
 * **マスに置く物は東西南北のどれかを向かせる。** 当たり判定は回転後の4頂点を囲む四角
 * （`getCollisionHalfExtents`）なので、斜めにすると最大√2倍に広がり、1マスからはみ出す。
 * @param rotationY - Y軸まわりの回転（ラジアン）
 * @returns 90度刻みに寄せた回転（-π/2 〜 π）
 */
export function snapRotationToQuarter(rotationY: number): number {
  const quarters = ((Math.round(rotationY / QUARTER_TURN) % 4) + 4) % 4;
  // 0, π/2, π, 3π/2 のうち 3π/2 は -π/2 で返す（rotationY の他の値と同じ向きの表し方にそろえる）
  return (quarters === 3 ? -1 : quarters) * QUARTER_TURN;
}

/**
 * 建物を区画（4×4マス）に置くときの中心の座標を求める。
 *
 * 東西は区画のまん中に置き、南北は**当たり判定の手前（北、扉のある側）の面を
 * 区画の北の縁にそろえる。** 建物の扉はすべて +Z を向いているため、区画のすぐ北の
 * マスに道を敷けば、扉の前に立った位置が必ずその道の上に乗る
 * （プレイヤーの当たり判定の半径0.45ぶん手前に立つ。道は2マス＝1.8あるので収まる）。
 * 掲示板のように奥行きの薄い物でも、扉の前と道の間が空かない。
 *
 * 建物（拡大後の当たり判定 3.74 × 3.08）は、区画の幅3.6より左右に0.07ずつはみ出す。
 * 見た目と当たり判定は変えないことにしたため、東西に隣り合う区画へ大きい建物を
 * 2棟並べるときは、2マス（道1本ぶん）空けること。
 * @param lot - 区画の南西のマス
 * @param halfDepth - 拡大後の当たり判定の奥行きの半分
 * @returns 建物の中心のXZ座標
 */
export function getLotBuildingPosition(lot: TownCell, halfDepth: number): { x: number; z: number } {
  const bounds = getCellsBounds(lot, BUILDING_LOT_CELLS);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: bounds.maxZ - halfDepth,
  };
}
