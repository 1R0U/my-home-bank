import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ASSET_CATALOG,
  getDecorationCells,
  getDecorationMaxScale,
  getPlaceableDecorations,
} from "../lib/rpg-hub/catalog.ts";
import {
  BUILDING_LOT_CELLS,
  getCellAt,
  getCellsBounds,
  getCellsCenter,
  getLotBuildingPosition,
  snapRotationToQuarter,
  snapToCells,
  TOWN_CELL_SIZE,
} from "../lib/rpg-hub/townGrid.ts";

const assertClose = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

test("マスの一辺は0.9で、道のタイル1枚がちょうど 2×2 マスになる", () => {
  assert.equal(TOWN_CELL_SIZE, 0.9);
  assertClose(
    ASSET_CATALOG.path.placement.size,
    TOWN_CELL_SIZE * ASSET_CATALOG.path.placement.cells,
    "道のタイルの一辺",
  );
});

test("マス(0, 0)は出発地点(0, 0)から東・北へ1マスの範囲", () => {
  assert.deepEqual(getCellsBounds({ col: 0, row: 0 }, 1), { maxX: 0.9, maxZ: 0.9, minX: 0, minZ: 0 });
  const center = getCellsCenter({ col: -3, row: 2 }, 1);
  assertClose(center.x, -2.25, "x");
  assertClose(center.z, 2.25, "z");
});

test("2×2 マスの物の中心は、南西のマスの北東の角", () => {
  const center = getCellsCenter({ col: -1, row: -1 }, 2);
  assertClose(center.x, 0, "x");
  assertClose(center.z, 0, "z");
});

test("座標から、その物を置く南西のマスを求める", () => {
  // 1マスの物は、座標が入っているマス
  assert.deepEqual(getCellAt(0.2, -0.2, 1), { col: 0, row: -1 });
  assert.deepEqual(getCellAt(-2.25, 2.25, 1), { col: -3, row: 2 });
  // 2×2 の物は、中心にいちばん近い角を北東の角とするマス
  assert.deepEqual(getCellAt(0.1, 0.1, 2), { col: -1, row: -1 });
  assert.deepEqual(getCellAt(1.7, -1.9, 2), { col: 1, row: -3 });
  // 中心から求めたマスに置き直すと、同じ中心に戻る
  for (const cells of [1, 2, 4]) {
    for (const cell of [{ col: -7, row: 3 }, { col: 5, row: -11 }]) {
      const center = getCellsCenter(cell, cells);
      assert.deepEqual(getCellAt(center.x, center.z, cells), cell);
    }
  }
});

test("マスにそろっていない座標は、いちばん近い置き方へ寄せる", () => {
  const one = snapToCells(1.0, -0.1, 1);
  assertClose(one.x, 1.35, "1マスの x");
  assertClose(one.z, -0.45, "1マスの z");
  const two = snapToCells(1.0, -0.1, 2);
  assertClose(two.x, 0.9, "2×2 の x");
  assertClose(two.z, 0, "2×2 の z");
});

test("向きは、いちばん近い90度刻みへ寄せる", () => {
  assertClose(snapRotationToQuarter(0.3), 0, "0.3");
  assertClose(snapRotationToQuarter(1.2), Math.PI / 2, "1.2");
  assertClose(snapRotationToQuarter(Math.PI), Math.PI, "π");
  assertClose(snapRotationToQuarter(-Math.PI), Math.PI, "-π");
  assertClose(snapRotationToQuarter(-1.5), -Math.PI / 2, "-1.5");
  assertClose(snapRotationToQuarter(4.8), -Math.PI / 2, "4.8（3π/2付近）");
  assertClose(snapRotationToQuarter(2 * Math.PI + 0.1), 0, "2π + 0.1");
});

test("建物は東西が区画のまん中、手前の面が区画の北の縁にそろう", () => {
  const halfDepth = 1.54;
  const lot = { col: 5, row: -7 };
  const bounds = getCellsBounds(lot, BUILDING_LOT_CELLS);
  const position = getLotBuildingPosition(lot, halfDepth);
  assertClose(position.x, 6.3, "x");
  assertClose(position.z + halfDepth, -2.7, "手前の面");
  assertClose(bounds.maxX - bounds.minX, 3.6, "区画の幅");
});

test("奥行きの薄い物も、手前の面が区画の北の縁にそろう（扉の前と道の間が空かない）", () => {
  const position = getLotBuildingPosition({ col: -5, row: -7 }, 0.25);
  assertClose(position.x, -2.7, "x");
  assertClose(position.z, -2.95, "z");
});

test("「かざる」で置ける装飾は、拡大率1で見た目も当たり判定も占めるマスに収まる", () => {
  // 置くときの拡大率は1（RpgHubScreen の handlePlace）。収まらない物は 2×2 マスにする
  for (const assetId of getPlaceableDecorations()) {
    const maxScale = getDecorationMaxScale(assetId);
    assert.ok(maxScale >= 1, `${assetId} は拡大率1でマスからはみ出す（上限 ${maxScale.toFixed(2)}）`);
  }
});

test("保存済みの装飾をマスへ寄せるマイグレーションの 2×2 の一覧が、カタログと同じ", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261017054919_snap_placed_decorations_to_town_grid.sql", import.meta.url),
    "utf8",
  );
  const listed = [...sql.slice(sql.indexOf("when asset_id in (")).matchAll(/'(decoration-[a-z-]+)'/g)]
    .map((match) => match[1])
    .sort();
  const expected = getPlaceableDecorations()
    .filter((assetId) => getDecorationCells(assetId) === 2)
    .sort();
  assert.deepEqual(listed, expected);
  // 2×2 以外の大きさの装飾を足したら、マイグレーションの寄せ方も見直す
  assert.ok(getPlaceableDecorations().every((assetId) => [1, 2].includes(getDecorationCells(assetId))));
});
