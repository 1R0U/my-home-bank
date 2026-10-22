// 装飾を置ける場所かどうかを決める（Issue #224）。
//
// **一番大事なのは、置き方でプレイヤーが詰まないこと。**
// 装飾には当たり判定があるので、並べ方によっては道を分断したり、建物の入口を
// 塞いだりできてしまう。子供が操作する画面なので、詰んでから気づくのでは遅い。
//
// そこで、**置く前に「置いたあとの町」を作って、そこを歩き回れるかを確かめる**。
// 既存のテストがマップ全体を走査して「詰む座標が無いこと」「全ての建物に近づけること」を
// 確認しているのと同じ考え方で、それを実行時に1回ぶんやる。
//
// ここは描画に依存しない純粋な計算だけを持つ（movement.ts / npcWander.ts と同じ方針）。

import {
  PLAYER_COLLISION_RADIUS,
  WALKABLE_BOUNDS,
  getCollisionHalfExtents,
  getScale,
} from "./movement.ts";
import { isOutsideHouseFloor, isPlacementSpotBlocked } from "./placementSpot.ts";
import { isInsideWorld } from "./worldBounds.ts";
import type { BuildingMapObject, MapObject } from "../../types/map";

/**
 * 置ける数の上限。
 *
 * 描画の負荷をどこまで許せるかは #200 で測る予定なので、それまでは控えめにしておく。
 * 町の固定物が既に百個近くあり、装飾はそこへ足す形になる。
 */
export const MAX_PLACED_DECORATIONS = 20;

// 置く場所の計算は、3Dシーン（置き場所の目印）からも使うので placementSpot.ts に分けてある。
// このファイルは mapObjects.ts まで読み込むため、シーンのバンドルに入れられない。
export { CANDIDATE_ID, createDecorationCandidate, isPlacementSpotBlocked } from "./placementSpot.ts";

/**
 * 歩けるかを調べるときの格子の間隔。
 *
 * 細かいほど正確だが、そのぶん調べる点が増える。プレイヤーの半径（0.45）より
 * 十分小さくして、通れるすき間を見落とさないようにしている。
 */
const GRID_STEP = 0.25;

/** 置けない理由。 */
export type PlacementRejection =
  /** そこに既に何かある、またはプレイヤーと重なる */
  | "blocked"
  /** 置くと行けなくなる建物がある（道を塞ぐ・入口を塞ぐ） */
  | "unreachable"
  /** 置ける数の上限に達している */
  | "limit"
  /** 家の中で、置く場所が部屋の床の外になっている（Issue #444） */
  | "outside";

/** 置けない理由を画面に出すための文言。子供が読むので漢字を使わない。 */
export const PLACEMENT_REJECTION_MESSAGES: Record<PlacementRejection, string> = {
  blocked: "ここには おけません",
  limit: `おけるのは ${MAX_PLACED_DECORATIONS}こ までです`,
  outside: "へやの そとには おけません",
  unreachable: "ここに おくと たてものに いけなくなります",
};

/**
 * 当たり判定を持つものすべてを囲む四角を求め、外側へ少し広げて返す。
 *
 * **広げた四角の外側には障害物が1つも無い。** つまり外周をぐるりと回れるので、
 * 「町の外へ出て反対側から戻る」経路もこの中で表現できる。
 *
 * **プレイヤーの位置は範囲に入れない。** 町から離れたところに立っているだけで格子が
 * 大きくなるため（歩ける範囲に上限が無かったころ、(800, 800) で1秒かかっていた）。
 * 外にいるプレイヤーは外周へ丸めればよく、外周から先は何も無いので経路の意味は変わらない。
 * 町の境界（柵・海）より外へは回り込めないので、町では `clipToWalkable` で切り取って使う。
 * @param objects - マップオブジェクト一覧
 * @returns 調べる範囲
 */
function getSearchBounds(
  objects: readonly MapObject[],
): { maxX: number; maxZ: number; minX: number; minZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const object of objects) {
    if (!object.collidable || !object.collisionSize) continue;
    // 向きも考える（rasterizeObstacles と同じ。Issue #477）
    const half = getCollisionHalfExtents(object.collisionSize, getScale(object), object.rotationY ?? 0);
    const halfWidth = half.width + PLAYER_COLLISION_RADIUS;
    const halfDepth = half.depth + PLAYER_COLLISION_RADIUS;
    minX = Math.min(minX, object.position.x - halfWidth);
    maxX = Math.max(maxX, object.position.x + halfWidth);
    minZ = Math.min(minZ, object.position.z - halfDepth);
    maxZ = Math.max(maxZ, object.position.z + halfDepth);
  }

  // 障害物が1つも無ければ、どこへでも歩ける
  if (minX === Infinity) return { maxX: 1, maxZ: 1, minX: -1, minZ: -1 };

  // 外周1マスぶん余計に広げる。ここが「町の外」を表す通り道になる
  const margin = GRID_STEP * 2;
  return {
    maxX: maxX + margin,
    maxZ: maxZ + margin,
    minX: minX - margin,
    minZ: minZ - margin,
  };
}

/**
 * 調べる範囲を、町で歩ける範囲（`WALKABLE_BOUNDS`）の内側に切り取る（Issue #194）。
 *
 * `getSearchBounds` は障害物の外周を「町の外へ回り込める通り道」として扱うが、
 * 障害物が町の境界ぎわまであると、その通り道は柵や海の向こうになって実際には通れない。
 * 切り取っておかないと、柵ぎわに置いて道を塞いでも「外を回れば行ける」と判定してしまう。
 * @param bounds - 調べる範囲
 * @returns 歩ける範囲の内側に切り取った範囲
 */
function clipToWalkable(bounds: { maxX: number; maxZ: number; minX: number; minZ: number }): {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
} {
  return {
    maxX: Math.min(bounds.maxX, WALKABLE_BOUNDS.maxX),
    maxZ: Math.min(bounds.maxZ, WALKABLE_BOUNDS.maxZ),
    minX: Math.max(bounds.minX, WALKABLE_BOUNDS.minX),
    minZ: Math.max(bounds.minZ, WALKABLE_BOUNDS.minZ),
  };
}

/**
 * 候補が、ほかの障害物からぽつんと離れているかを判定する。
 *
 * **離れた1つは、必ず回り込める。** まわりに何も無い場所に置いた物は、どこへの
 * 行き来も妨げないので、歩けるかを調べるまでもない。
 *
 * この早道が無いと、町から遠く離れた場所に置いたときに格子が距離の2乗で大きくなる。
 * 歩ける範囲に上限が無かったころ、実測で (800, 800) は1秒かかっていた。
 * @param candidate - 置こうとしている装飾
 * @param bounds - ほかの障害物を囲む範囲
 * @returns 触れていなければ true
 */
function isIsolatedFrom(
  candidate: MapObject,
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
): boolean {
  if (!candidate.collisionSize) return true;
  // 向きも考える（rasterizeObstacles と同じ。Issue #477）
  const half = getCollisionHalfExtents(candidate.collisionSize, getScale(candidate), candidate.rotationY ?? 0);
  const halfWidth = half.width + PLAYER_COLLISION_RADIUS;
  const halfDepth = half.depth + PLAYER_COLLISION_RADIUS;
  return (
    candidate.position.x + halfWidth < bounds.minX ||
    candidate.position.x - halfWidth > bounds.maxX ||
    candidate.position.z + halfDepth < bounds.minZ ||
    candidate.position.z - halfDepth > bounds.maxZ
  );
}

/**
 * 建物の入口の座標を求める。
 * @param building - 対象の建物
 * @returns 入口のXZ座標
 */
function getEntrancePoint(building: BuildingMapObject): { x: number; z: number } {
  const scale = getScale(building);
  return {
    x: building.position.x + building.entranceOffset.x * scale,
    z: building.position.z + building.entranceOffset.z * scale,
  };
}

/**
 * 調べる範囲を、格子として扱うための情報にする。
 * @param bounds - 調べる範囲
 * @returns 格子の大きさと、格子の目と座標の変換
 */
function toGrid(bounds: { maxX: number; maxZ: number; minX: number; minZ: number }) {
  return {
    columns: Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / GRID_STEP) + 1),
    rows: Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / GRID_STEP) + 1),
    toX: (column: number) => bounds.minX + column * GRID_STEP,
    toZ: (row: number) => bounds.minZ + row * GRID_STEP,
  };
}

/**
 * 障害物を格子へ塗る。
 *
 * **1マスごとに全オブジェクトを調べない。** それだと「マスの数 × オブジェクトの数」に
 * なって、町ひとつぶんで0.25秒かかっていた。オブジェクトごとに、そのオブジェクトが
 * ふさぐマスだけを塗れば、触るのは「オブジェクトの数 × ふさぐマスの数」で済む。
 * @param objects - マップオブジェクト一覧
 * @param bounds - 調べる範囲
 * @param grid - 格子の情報
 * @returns ふさがっているマスが1になった配列
 */
function rasterizeObstacles(
  objects: readonly MapObject[],
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number },
  grid: { columns: number; rows: number },
): Uint8Array {
  const blocked = new Uint8Array(grid.columns * grid.rows);

  for (const object of objects) {
    if (!object.collidable || !object.collisionSize) continue;
    // movement.ts の overlapsObject と同じ広げ方にする。ずれると、歩ける判定と
    // 置ける判定が食い違って「置けたのに通れない」が起きる。
    // **向きも同じく考える**（Issue #477）。以前は向きを見ておらず、90度回した物（左の壁・回した家具）の
    // 横と奥行きが入れ替わらないまま塗っていた
    const half = getCollisionHalfExtents(object.collisionSize, getScale(object), object.rotationY ?? 0);
    const halfWidth = half.width + PLAYER_COLLISION_RADIUS;
    const halfDepth = half.depth + PLAYER_COLLISION_RADIUS;

    const fromColumn = Math.max(
      0,
      Math.ceil((object.position.x - halfWidth - bounds.minX) / GRID_STEP),
    );
    const toColumn = Math.min(
      grid.columns - 1,
      Math.floor((object.position.x + halfWidth - bounds.minX) / GRID_STEP),
    );
    const fromRow = Math.max(0, Math.ceil((object.position.z - halfDepth - bounds.minZ) / GRID_STEP));
    const toRow = Math.min(
      grid.rows - 1,
      Math.floor((object.position.z + halfDepth - bounds.minZ) / GRID_STEP),
    );

    for (let row = fromRow; row <= toRow; row += 1) {
      const offset = row * grid.columns;
      for (let column = fromColumn; column <= toColumn; column += 1) {
        blocked[offset + column] = 1;
      }
    }
  }
  return blocked;
}

/**
 * ふさがっていないマスを、出発点から4方向へ塗りつぶす。
 * @param blocked - ふさがっているマス
 * @param grid - 格子の情報
 * @param startIndex - 出発点のマス
 * @returns 行けるマスが1になった配列
 */
function floodFill(
  blocked: Uint8Array,
  grid: { columns: number; rows: number },
  startIndex: number,
): Uint8Array {
  const visited = new Uint8Array(blocked.length);
  if (blocked[startIndex]) return visited;

  visited[startIndex] = 1;
  const queue = [startIndex];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const column = index % grid.columns;
    const row = (index - column) / grid.columns;

    if (column > 0) pushIfOpen(index - 1);
    if (column < grid.columns - 1) pushIfOpen(index + 1);
    if (row > 0) pushIfOpen(index - grid.columns);
    if (row < grid.rows - 1) pushIfOpen(index + grid.columns);
  }
  return visited;

  function pushIfOpen(nextIndex: number): void {
    if (visited[nextIndex] || blocked[nextIndex]) return;
    visited[nextIndex] = 1;
    queue.push(nextIndex);
  }
}

/**
 * 塗りつぶしの出発点にするマスを選ぶ。
 *
 * **丸めた先が塞がっていたら、近くの空いているマスを使う。**
 * `overlapsObject` は境界ちょうどを通れる扱いにするが、格子へ塗るときは安全側に倒して
 * 境界のマスも塞ぐ。そのため**立てる場所なのに、丸めた先だけ塞がっている**ことがある
 * （町なかで実測16,183箇所）。そこを出発点にすると塗りつぶしが空になり、
 * 「置く前も後も行ける建物が0」として比較が素通りして、**建物を封鎖する置き方が通ってしまう**。
 * @param blocked - ふさがっているマス
 * @param grid - 格子の情報
 * @param from - プレイヤーの位置
 * @param bounds - 調べる範囲
 * @returns 出発点のマス
 */
function findStartIndex(
  blocked: Uint8Array,
  grid: { columns: number; rows: number },
  from: { x: number; z: number },
  bounds: { minX: number; minZ: number },
): number {
  const column = Math.min(
    grid.columns - 1,
    Math.max(0, Math.round((from.x - bounds.minX) / GRID_STEP)),
  );
  const row = Math.min(grid.rows - 1, Math.max(0, Math.round((from.z - bounds.minZ) / GRID_STEP)));
  if (!blocked[row * grid.columns + column]) return row * grid.columns + column;

  // 近い順に見て、最初に見つかった空きマスを使う。プレイヤーが実際に立てている以上、
  // 壁1つぶん（0.45）の範囲に空きがあるはずなので、そこまでで打ち切る
  const maxRing = Math.ceil(PLAYER_COLLISION_RADIUS / GRID_STEP) + 1;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    for (let dRow = -ring; dRow <= ring; dRow += 1) {
      for (let dColumn = -ring; dColumn <= ring; dColumn += 1) {
        // いちばん外の枠だけを見る（内側は前の ring で見ている）
        if (Math.abs(dRow) !== ring && Math.abs(dColumn) !== ring) continue;
        const nextRow = row + dRow;
        const nextColumn = column + dColumn;
        if (nextRow < 0 || nextRow >= grid.rows) continue;
        if (nextColumn < 0 || nextColumn >= grid.columns) continue;
        const index = nextRow * grid.columns + nextColumn;
        if (!blocked[index]) return index;
      }
    }
  }
  // 見つからなければ丸めた先をそのまま返す（塗りつぶしは空になる）
  return row * grid.columns + column;
}

/**
 * ある地点から歩いて行ける建物を数える。
 *
 * 外周は障害物が無いので必ずつながっており、「町の外を回って反対側へ出る」経路も
 * 落とさない。入口そのものは建物の中かもしれないので、**接近判定が成立する距離まで
 * 行けるか**で見る。
 * @param blocked - ふさがっているマス
 * @param grid - 格子の情報
 * @param from - 出発点
 * @param buildings - 建物一覧
 * @param entrances - 建物ごとの入口の座標
 * @returns 接近できる建物のidの集合
 */
function findReachableBuildingIds(
  blocked: Uint8Array,
  grid: { columns: number; rows: number; toX: (c: number) => number; toZ: (r: number) => number },
  from: { x: number; z: number },
  buildings: readonly BuildingMapObject[],
  entrances: readonly { x: number; z: number }[],
  bounds: { minX: number; minZ: number },
): Set<string> {
  // 範囲の外に立っているプレイヤーは外周へ丸める。外周より先には障害物が無く、
  // どこからでも回り込めるので、丸めても行ける先は変わらない
  const visited = floodFill(blocked, grid, findStartIndex(blocked, grid, from, bounds));

  const reachableIds = new Set<string>();
  const remaining = buildings.map((building, index) => ({
    building,
    entrance: entrances[index],
  }));

  for (let index = 0; index < visited.length && remaining.length > 0; index += 1) {
    if (!visited[index]) continue;
    const column = index % grid.columns;
    const x = grid.toX(column);
    const z = grid.toZ((index - column) / grid.columns);

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const entry = remaining[i];
      const distance = Math.hypot(x - entry.entrance.x, z - entry.entrance.z);
      if (distance > entry.building.interactionRadius) continue;
      reachableIds.add(entry.building.id);
      remaining.splice(i, 1);
    }
  }
  return reachableIds;
}

/**
 * そこに装飾を置いてよいかを判定する。
 *
 * 置けないときは理由を返す。**置いたあとの町を実際に歩いてみて**、いま行ける建物へ
 * 変わらず行けることを確かめる。判定が重いのは、置く操作のときだけ走るので許容する。
 * @param candidate - 置こうとしている装飾
 * @param objects - いまのマップオブジェクト一覧（町の固定物＋置いた装飾）
 * @param playerPosition - プレイヤーの位置
 * @param placedCount - すでに置いてある数
 * @returns 置けないときは理由、置けるときは null
 */
export function canPlaceDecoration(
  candidate: MapObject,
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
  placedCount: number,
): PlacementRejection | null {
  if (placedCount >= MAX_PLACED_DECORATIONS) return "limit";
  // 床の外は、踏んで歩ける装飾でも置けない（宙に浮いて見えるうえ、家の区画から外れる）
  if (isOutsideHouseFloor(candidate, playerPosition)) return "outside";

  if (isPlacementSpotBlocked(candidate, objects, playerPosition)) return "blocked";
  // 踏んで歩けるもの（草むらなど）は誰の邪魔にもならないので、重なりと境界だけ見ればよい
  if (!(candidate.collidable && candidate.collisionSize)) return null;

  const buildings = objects.filter(
    (object): object is BuildingMapObject => object.type === "building",
  );
  if (buildings.length === 0) return null;
  const entrances = buildings.map(getEntrancePoint);

  // まわりに何も無い場所へ置くなら、回り込めるので調べるまでもない
  if (isIsolatedFrom(candidate, getSearchBounds(objects))) return null;

  // 置いたあとの町も収まるように、候補も含めて範囲を決める。
  // 町にいるときは、町の境界より外へ回り込めないよう、歩ける範囲で切り取る（Issue #194）
  const searchBounds = getSearchBounds([...objects, candidate]);
  const bounds = isInsideWorld(playerPosition.x, playerPosition.z)
    ? clipToWalkable(searchBounds)
    : searchBounds;
  const grid = toGrid(bounds);

  // **先に「置いたあと」を調べる。** ほとんどの場合そこで全部の建物へ行けるので、
  // 塗りつぶしが1回で済む（2回やると町ひとつぶんで倍の時間がかかる）。
  const before = rasterizeObstacles(objects, bounds, grid);
  const after = rasterizeObstacles([candidate], bounds, grid);
  for (let index = 0; index < after.length; index += 1) {
    if (before[index]) after[index] = 1;
  }
  const reachableAfter = findReachableBuildingIds(
    after,
    grid,
    playerPosition,
    buildings,
    entrances,
    bounds,
  );
  if (reachableAfter.size === buildings.length) return null;

  // 行けない建物があったときだけ、「置く前から行けなかったのか」を調べる。
  // **「全部の建物へ行けること」ではなく「減らないこと」で判定する。** 置く前から
  // 行けない建物があっても（町の外に立っているなど）操作を止めないため。
  const reachableBefore = findReachableBuildingIds(
    before,
    grid,
    playerPosition,
    buildings,
    entrances,
    bounds,
  );
  for (const id of reachableBefore) {
    if (!reachableAfter.has(id)) return "unreachable";
  }
  return null;
}

/**
 * その建物（家の中の家具を含む）の入口へ、プレイヤーが歩いて近づけるか（Issue #477）。
 *
 * 家具を動かす・回すときに、**動かした家具そのもの**を使えるかを確かめる。`canPlaceDecoration` は
 * 置く物以外の建物へ行けるかしか見ないため、家具の正面を壁や装飾でふさぐ置き方を見落とす。
 * @param objects - 動かしたあとのマップオブジェクト一覧（動かした家具を含む）
 * @param playerPosition - プレイヤーの位置
 * @param buildingId - 確かめる建物のid
 * @returns 近づけるなら true。建物が見つからなければ false
 */
export function isBuildingReachable(
  objects: readonly MapObject[],
  playerPosition: { x: number; z: number },
  buildingId: string,
): boolean {
  const building = objects.find(
    (object): object is BuildingMapObject => object.type === "building" && object.id === buildingId,
  );
  if (!building) return false;
  const searchBounds = getSearchBounds(objects);
  const bounds = isInsideWorld(playerPosition.x, playerPosition.z) ? clipToWalkable(searchBounds) : searchBounds;
  const grid = toGrid(bounds);
  const blocked = rasterizeObstacles(objects, bounds, grid);
  return findReachableBuildingIds(blocked, grid, playerPosition, [building], [getEntrancePoint(building)], bounds).has(
    buildingId,
  );
}
