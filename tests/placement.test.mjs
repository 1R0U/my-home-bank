import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { getDecorationPlacement, getPlaceableDecorations, groundedY } from "../lib/rpg-hub/catalog.ts";
import { isBlocked } from "../lib/rpg-hub/movement.ts";
import {
  MAX_PLACED_DECORATIONS,
  PLACEMENT_REJECTION_MESSAGES,
  PLACE_DISTANCE,
  canPlaceDecoration,
  findNearestPlacedId,
  getPlacementPoint,
} from "../lib/rpg-hub/placement.ts";

/**
 * 装飾を置ける場所かどうかの判定（Issue #224）。
 *
 * **一番大事なのは、置き方でプレイヤーが詰まないこと。**
 * 子供が操作する画面なので、詰んでから気づくのでは遅い。
 */

let counter = 0;
const decoration = (x, z, assetId = "decoration-rock") => {
  const placement = getDecorationPlacement(assetId);
  const solid = placement.solid !== false;
  return {
    collidable: solid,
    ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
    id: `test-${counter++}`,
    interactive: false,
    model: assetId,
    position: { x, y: groundedY(placement.halfHeight, 1), z },
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
      if (!isBlocked(x, z, INITIAL_MAP_OBJECTS)) return { x, z };
    }
  }
  throw new Error("空いている場所が見つからない");
};

const BANK = INITIAL_MAP_OBJECTS.find((object) => object.id === "bank-building");
const BANK_ENTRANCE = {
  x: BANK.position.x + BANK.entranceOffset.x * (BANK.scale ?? 1),
  z: BANK.position.z + BANK.entranceOffset.z * (BANK.scale ?? 1),
};

// --- 置く場所の決め方 ---

test("装飾はプレイヤーの正面に置かれる", () => {
  // 正面は +Z（キャラクターの向きの決まり。buildingParts.ts のコメント）
  const forward = getPlacementPoint({ x: 0, z: 0 }, 0);
  assert.ok(Math.abs(forward.x) < 1e-9);
  assert.ok(Math.abs(forward.z - PLACE_DISTANCE) < 1e-9);

  const right = getPlacementPoint({ x: 0, z: 0 }, Math.PI / 2);
  assert.ok(Math.abs(right.x - PLACE_DISTANCE) < 1e-9);
  assert.ok(Math.abs(right.z) < 1e-9);
});

test("置く場所はプレイヤーの位置を起点にする", () => {
  const point = getPlacementPoint({ x: 3, z: -4 }, 0);

  assert.ok(Math.abs(point.x - 3) < 1e-9);
  assert.ok(Math.abs(point.z - (-4 + PLACE_DISTANCE)) < 1e-9);
});

// --- 置ける・置けない ---

test("空いている場所には置ける", () => {
  const spot = findFreeSpot();

  assert.equal(
    canPlaceDecoration(decoration(spot.x, spot.z), INITIAL_MAP_OBJECTS, { x: 0, z: 0 }, 0),
    null,
  );
});

test("自分のいる場所には置けない", () => {
  // 置けると自分を閉じ込める
  assert.equal(
    canPlaceDecoration(decoration(0.2, 0.2), INITIAL_MAP_OBJECTS, { x: 0, z: 0 }, 0),
    "blocked",
  );
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

test("踏んで歩けるものは、重なっていても置ける", () => {
  // 草むらは当たり判定を持たないので、誰の邪魔にもならない
  assert.equal(
    canPlaceDecoration(
      decoration(0.2, 0.2, "decoration-grass"),
      INITIAL_MAP_OBJECTS,
      { x: 0, z: 0 },
      0,
    ),
    null,
  );
});

// --- 詰み防止（ここが本題） ---

test("建物の入口を囲もうとすると、閉じる手前で止まる", () => {
  // 入口のまわりに岩を並べて、銀行へ行けなくする置き方を試みる
  let objects = [...INITIAL_MAP_OBJECTS];
  let placed = 0;
  let stopped = false;

  for (let angle = 0; angle < 360; angle += 6) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      BANK_ENTRANCE.x + Math.cos(radian) * 3.4,
      BANK_ENTRANCE.z + Math.sin(radian) * 3.4,
    );
    const rejection = canPlaceDecoration(candidate, objects, { x: 0, z: 0 }, placed);
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

  let objects = [...INITIAL_MAP_OBJECTS];
  let placed = 0;
  let stopped = false;
  for (let angle = 0; angle < 360; angle += 6) {
    const radian = (angle * Math.PI) / 180;
    const candidate = decoration(
      BANK_ENTRANCE.x + Math.cos(radian) * 3.4,
      BANK_ENTRANCE.z + Math.sin(radian) * 3.4,
    );
    const rejection = canPlaceDecoration(candidate, objects, player, placed);
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
  let objects = [...INITIAL_MAP_OBJECTS];
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

// --- しまう相手を探す ---

test("近くにある、置いた装飾を返す", () => {
  const placed = { ...decoration(1, 1), id: "placed-abc" };

  assert.equal(findNearestPlacedId({ x: 1, z: 1.5 }, [placed], 2), "placed-abc");
});

test("町の固定物はしまう対象にしない", () => {
  // 建物や道、最初から散らしてある木を拾えてはいけない
  assert.equal(findNearestPlacedId({ x: 0, z: 0 }, INITIAL_MAP_OBJECTS, 5), null);
});

test("離れているものは返さない", () => {
  const placed = { ...decoration(10, 10), id: "placed-far" };

  assert.equal(findNearestPlacedId({ x: 0, z: 0 }, [placed], 2), null);
});

test("いちばん近いものを返す", () => {
  const near = { ...decoration(1, 0), id: "placed-near" };
  const far = { ...decoration(1.8, 0), id: "placed-far" };

  assert.equal(findNearestPlacedId({ x: 0, z: 0 }, [far, near], 3), "placed-near");
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
