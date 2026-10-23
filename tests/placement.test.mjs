import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { getDecorationPlacement, getPlaceableDecorations, groundedY } from "../lib/rpg-hub/catalog.ts";
import { isBlocked } from "../lib/rpg-hub/movement.ts";
import {
  MAX_PLACED_DECORATIONS,
  PLACEMENT_REJECTION_MESSAGES,
  canPlaceDecoration,
} from "../lib/rpg-hub/placement.ts";
import { isCellTaken, isPlacementSpotBlocked } from "../lib/rpg-hub/placementSpot.ts";
import { BUILDING_LOT_CELLS, getCellsCenter, snapDecorationToCells } from "../lib/rpg-hub/townGrid.ts";

/**
 * 装飾を置ける場所かどうかの判定（Issue #224）。
 *
 * **一番大事なのは、置き方でプレイヤーが詰まないこと。**
 * 子供が操作する画面なので、詰んでから気づくのでは遅い。
 */

let counter = 0;
/**
 * 置く装飾の候補を作る。既定はランプ。
 *
 * **囲い込みを試すには、1マスで当たり判定を持つ物を使う。** しげみ・岩・木は 2×2 マスを占め、
 * 当たり判定（一辺0.9前後）のまわりに空きがあるため、隣どうしの間をプレイヤーが通れてしまい
 * そもそも囲めない（Issue #445）。
 */
const decoration = (x, z, assetId = "decoration-lamp") => {
  const placement = getDecorationPlacement(assetId);
  const solid = placement.solid !== false;
  // 実際に置くときと同じく、マスへ寄せる（Issue #445。createDecorationCandidate と同じ）
  const point = snapDecorationToCells(assetId, x, z);
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id: `test-${counter++}`,
    interactive: false,
    model: assetId,
    position: { x: point.x, y: groundedY(placement.halfHeight, 1), z: point.z },
    type: "decoration",
  };
};

/**
 * 何も置かれていない場所を探す。町の固定物は散らばっているので決め打ちにしない。
 * @param from - この点から離れた場所を探す（自分の足元を返さないため）
 */
const findFreeSpot = (from = { x: 0, z: 0 }) => {
  for (let x = -14; x <= 14; x += 0.5) {
    for (let z = -14; z <= 14; z += 0.5) {
      if (Math.hypot(x - from.x, z - from.z) < 3) continue;
      // 当たり判定の無い草むらがあるマスにも置けない（1マスに1つ。Issue #445）
      if (!isBlocked(x, z, INITIAL_MAP_OBJECTS) && !isCellTaken(decoration(x, z), INITIAL_MAP_OBJECTS)) {
        return { x, z };
      }
    }
  }
  throw new Error("空いている場所が見つからない");
};

const BANK = INITIAL_MAP_OBJECTS.find((object) => object.id === "bank-building");
const BANK_ENTRANCE = {
  x: BANK.position.x + BANK.entranceOffset.x * (BANK.scale ?? 1),
  z: BANK.position.z + BANK.entranceOffset.z * (BANK.scale ?? 1),
};

// --- 置ける・置けない ---

test("空いている場所には置ける", () => {
  const spot = findFreeSpot();

  assert.equal(
    canPlaceDecoration(decoration(spot.x, spot.z), INITIAL_MAP_OBJECTS, { x: 0, z: 0 }, 0),
    null,
  );
});

test("自分のいる場所には置けない", () => {
  // 置けると自分を閉じ込める。マスは空いている場所で、自分と重なることだけで止まるのを確かめる
  const spot = findFreeSpot();
  const candidate = decoration(spot.x, spot.z);
  assert.equal(canPlaceDecoration(candidate, INITIAL_MAP_OBJECTS, candidate.position, 0), "blocked");
});

test("すでに何かある場所には置けない", () => {
  const tree = INITIAL_MAP_OBJECTS.find(
    (object) => object.type === "decoration" && object.collidable,
  );

  assert.equal(
    canPlaceDecoration(
      decoration(tree.position.x, tree.position.z),
      INITIAL_MAP_OBJECTS,
      { x: 0, z: 0 },
      0,
    ),
    "blocked",
  );
});

test("置ける数には上限がある", () => {
  const spot = findFreeSpot();
  const candidate = decoration(spot.x, spot.z);

  assert.equal(
    canPlaceDecoration(candidate, INITIAL_MAP_OBJECTS, { x: 0, z: 0 }, MAX_PLACED_DECORATIONS - 1),
    null,
  );
  assert.equal(
    canPlaceDecoration(candidate, INITIAL_MAP_OBJECTS, { x: 0, z: 0 }, MAX_PLACED_DECORATIONS),
    "limit",
  );
});

test("踏んで歩けるものは、自分の足もとにも置ける", () => {
  // 草むらは当たり判定を持たないので、誰の邪魔にもならない
  const spot = findFreeSpot();
  const grass = decoration(spot.x, spot.z, "decoration-grass");
  assert.equal(canPlaceDecoration(grass, INITIAL_MAP_OBJECTS, grass.position, 0), null);
});

test("踏んで歩けるものでも、もう装飾があるマスには置けない（Issue #445）", () => {
  // 置き場所の目印（isPlacementSpotBlocked）が「置けない」と出す場所は、確定もできない
  const spot = findFreeSpot();
  const grass = decoration(spot.x, spot.z, "decoration-grass");
  const objects = [...INITIAL_MAP_OBJECTS, { ...grass, id: "placed-grass" }];
  const again = decoration(spot.x + 0.1, spot.z - 0.1, "decoration-grass");

  assert.equal(isPlacementSpotBlocked(again, objects, { x: 0, z: 0 }), true);
  assert.equal(canPlaceDecoration(again, objects, { x: 0, z: 0 }, 1), "blocked");
});

test("道の上には、踏んで歩ける物も置けない（Issue #445）", () => {
  // 出発地点(0, 0)は中央の道の上
  for (const assetId of ["decoration-grass", "decoration-lamp"]) {
    const candidate = decoration(0.2, 0.2, assetId);
    assert.equal(isPlacementSpotBlocked(candidate, INITIAL_MAP_OBJECTS, { x: 5, z: 5 }), true, assetId);
    assert.equal(canPlaceDecoration(candidate, INITIAL_MAP_OBJECTS, { x: 5, z: 5 }, 0), "blocked", assetId);
  }
});

test("建物の区画と、扉の前のマスには置けない（Issue #445）", () => {
  const lot = BANK.footprint;
  // 区画の中のどのマスにも置けない
  for (let col = lot.col; col < lot.col + lot.cells; col += 1) {
    for (let row = lot.row; row < lot.row + lot.cells; row += 1) {
      const center = getCellsCenter({ col, row }, 1);
      const grass = decoration(center.x, center.z, "decoration-grass");
      assert.equal(isPlacementSpotBlocked(grass, INITIAL_MAP_OBJECTS, { x: 0, z: 0 }), true, `区画 (${col}, ${row})`);
    }
  }
  // 扉の前（区画のすぐ北の1行）は、道が無くても置けない
  const withoutPaths = INITIAL_MAP_OBJECTS.filter((object) => object.model !== "decoration-path");
  for (let col = lot.col; col < lot.col + lot.cells; col += 1) {
    const center = getCellsCenter({ col, row: lot.row + BUILDING_LOT_CELLS }, 1);
    const grass = decoration(center.x, center.z, "decoration-grass");
    assert.equal(isPlacementSpotBlocked(grass, withoutPaths, { x: 0, z: 0 }), true, `扉の前 (${col})`);
  }
});

test("建物のすぐ隣のマスに置いても、壁にめり込まない（Issue #445）", () => {
  // 建物の当たり判定は区画に収めてあるので、隣のマスの装飾の当たり判定とは重ならない
  const lot = BANK.footprint;
  const west = getCellsCenter({ col: lot.col - 1, row: lot.row + 1 }, 1);
  const lamp = decoration(west.x, west.z);
  const bankHalfWidth = (BANK.collisionSize.width * BANK.scale) / 2;
  const lampHalf = lamp.collisionSize.width / 2;
  assert.ok(BANK.position.x - bankHalfWidth >= lamp.position.x + lampHalf - 1e-9, "銀行の西の壁に、隣のランプがめり込む");
});

// --- 詰み防止（ここが本題） ---

/**
 * 銀行を囲むテストの盤面。町から、固定の装飾（道・草むら・低木など）を除いたもの。
 *
 * 装飾は空いているマスにしか置けないので（Issue #445）、囲む輪が道や町の装飾のマスにかかると、
 * そこには置けない。道は建物どうしをつないでいるので、道を残すと輪がいつまでも閉じない
 * （＝町の盤面では、道が囲い込みを防いでいる）。ここで確かめたいのは、マスでは防げない形の
 * 「閉じる手前で止める」判定なので、町の並べ方に左右されないよう、建物とNPCだけの盤面で試す。
 */
const ENCLOSURE_BASE = INITIAL_MAP_OBJECTS.filter((object) => object.type !== "decoration");

test("建物の入口を囲もうとすると、閉じる手前で止まる", () => {
  // 入口のまわりに岩を並べて、銀行へ行けなくする置き方を試みる
  let objects = [...ENCLOSURE_BASE];
  let placed = 0;
  let stopped = false;

  for (let angle = 0; angle < 360; angle += 6) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      BANK_ENTRANCE.x + Math.cos(radian) * 3.4,
      BANK_ENTRANCE.z + Math.sin(radian) * 3.4,
    );
    // 置ける数の上限（MAX_PLACED_DECORATIONS）はここでは見ない。1マスずつ囲むと上限より多く要るため
    const rejection = canPlaceDecoration(candidate, objects, { x: 0, z: 0 }, 0);
    if (rejection === "unreachable") {
      stopped = true;
      break;
    }
    if (rejection === null) {
      objects.push(candidate);
      placed += 1;
    }
  }

  assert.ok(stopped, `銀行の入口を囲みきれてしまった（${placed}個置けた）`);
});

test("開始マスが塞がる位置に立っていても、囲い込みを止める", () => {
  // `overlapsObject` は境界ちょうどを通れる扱いにするが、格子は安全側に倒して境界も塞ぐ。
  // そのため「立てる場所なのに、丸めた先だけ塞がっている」位置がある（町なかで1万箇所以上）。
  // そこを出発点にすると塗りつぶしが空になり、比較が素通りして封鎖できてしまっていた
  const gridStep = 0.25;
  let minX = Infinity;
  let minZ = Infinity;
  for (const object of INITIAL_MAP_OBJECTS) {
    if (!object.collidable || !object.collisionSize) continue;
    const scale = object.scale ?? 1;
    minX = Math.min(minX, object.position.x - (object.collisionSize.width * scale) / 2 - 0.45);
    minZ = Math.min(minZ, object.position.z - (object.collisionSize.depth * scale) / 2 - 0.45);
  }
  minX -= gridStep * 2;
  minZ -= gridStep * 2;

  /** 立てるのに、丸めた格子が塞がっている位置を探す */
  const findRoundingTrap = () => {
    for (let x = -12; x <= 12; x += 0.02) {
      for (let z = -12; z <= 12; z += 0.02) {
        if (isBlocked(x, z, INITIAL_MAP_OBJECTS)) continue;
        const gridX = minX + Math.round((x - minX) / gridStep) * gridStep;
        const gridZ = minZ + Math.round((z - minZ) / gridStep) * gridStep;
        if (isBlocked(gridX, gridZ, INITIAL_MAP_OBJECTS)) return { x, z };
      }
    }
    return null;
  };

  const player = findRoundingTrap();
  assert.ok(player, "丸めで塞がる位置が見つからない（前提が変わった可能性）");

  let objects = [...ENCLOSURE_BASE];
  let placed = 0;
  let stopped = false;
  for (let angle = 0; angle < 360; angle += 6) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      BANK_ENTRANCE.x + Math.cos(radian) * 3.4,
      BANK_ENTRANCE.z + Math.sin(radian) * 3.4,
    );
    // 置ける数の上限はここでは見ない（上のテストと同じ）
    const rejection = canPlaceDecoration(candidate, objects, player, 0);
    if (rejection === "unreachable") {
      stopped = true;
      break;
    }
    if (rejection === null) {
      objects.push(candidate);
      placed += 1;
    }
  }

  assert.ok(stopped, `(${player.x}, ${player.z}) に立つと銀行を囲みきれてしまった`);
});

test("囲い込みで止まったあとも、他の建物へは行ける", () => {
  // 止めたあとの盤面がおかしくなっていないこと
  let objects = [...ENCLOSURE_BASE];
  for (let angle = 0; angle < 360; angle += 6) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      BANK_ENTRANCE.x + Math.cos(radian) * 3.4,
      BANK_ENTRANCE.z + Math.sin(radian) * 3.4,
    );
    if (canPlaceDecoration(candidate, objects, { x: 0, z: 0 }, 0) === null) objects.push(candidate);
  }

  const spot = findFreeSpot();
  assert.equal(canPlaceDecoration(decoration(spot.x, spot.z), objects, { x: 0, z: 0 }, 0), null);
});

test("自分のまわりを囲もうとしても、閉じる手前で止まる", () => {
  // 置いた本人が出られなくなるのが一番まずい
  const spot = findFreeSpot();
  const player = { x: spot.x + 4, z: spot.z + 4 };
  let objects = [...INITIAL_MAP_OBJECTS];
  let stopped = false;

  for (let angle = 0; angle < 360; angle += 5) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      player.x + Math.cos(radian) * 1.6,
      player.z + Math.sin(radian) * 1.6,
    );
    const rejection = canPlaceDecoration(candidate, objects, player, 0);
    if (rejection === "unreachable") {
      stopped = true;
      break;
    }
    if (rejection === null) objects.push(candidate);
  }

  assert.ok(stopped, "自分を閉じ込められてしまった");
});

test("町から遠く離れた場所へ置いても、判定がすぐ終わる", () => {
  // 歩ける範囲に上限が無いので、遠くにいるほど調べる格子が広がる。
  // まわりに何も無い1つは必ず回り込めるので、調べずに通す早道を入れてある
  // （入れる前は (800, 800) で1秒かかっていた）
  const started = Date.now();
  const rejection = canPlaceDecoration(
    decoration(801, 801),
    INITIAL_MAP_OBJECTS,
    { x: 800, z: 800 },
    0,
  );

  assert.equal(rejection, null);
  assert.ok(Date.now() - started < 100, `判定に ${Date.now() - started}ms かかった`);
});

test("置く前から行けない建物があっても、操作は止めない", () => {
  // 町から遠く離れた場所に立っていても、そこに置くぶんには困らない
  const far = { x: 400, z: 400 };

  assert.equal(canPlaceDecoration(decoration(401, 401), INITIAL_MAP_OBJECTS, far, 0), null);
});

// --- 画面に出す言葉 ---

test("置けない理由には、すべて文言がある", () => {
  for (const rejection of ["blocked", "limit", "unreachable"]) {
    assert.ok(PLACEMENT_REJECTION_MESSAGES[rejection], `${rejection} の文言がない`);
  }
});

test("置ける装飾はすべて名前を持ち、装飾として置ける", () => {
  const assetIds = getPlaceableDecorations();

  assert.ok(assetIds.length > 0, "置ける装飾が1つもない");
  for (const assetId of assetIds) {
    assert.ok(getDecorationPlacement(assetId), `${assetId} が装飾として置けない`);
  }
});

test("道のタイルは選ばせない", () => {
  // 町を組み立てるためのもので、子供が並べる物ではない
  assert.ok(!getPlaceableDecorations().includes("decoration-path"));
});
