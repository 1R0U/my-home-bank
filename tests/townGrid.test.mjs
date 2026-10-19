import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { ASSET_CATALOG, getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { HOUSE_GRID_ORIGIN, HOUSE_ROOM_CENTER } from "../lib/rpg-hub/houseInterior.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import {
  BUILDING_LOT_CELLS,
  cellRangesOverlap,
  getBlockedCells,
  getCellAt,
  getCellsBounds,
  getCellsCenter,
  getDecorationMaxScale,
  getLotBuildingPosition,
  getObjectCells,
  QUARTER_TURN,
  snapRotationToQuarter,
  snapToCells,
  TOWN_CELL_SIZE,
} from "../lib/rpg-hub/townGrid.ts";

/** 保存済みの装飾をマスへ寄せるマイグレーション（Issue #445）の中身。 */
const snapMigrationSql = () => {
  const names = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) =>
    name.endsWith("_snap_placed_decorations_to_town_grid.sql"),
  );
  assert.equal(names.length, 1, "マスへ寄せるマイグレーションが1つだけあるはず");
  return readFileSync(new URL(`../supabase/migrations/${names[0]}`, import.meta.url), "utf8");
};

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

// --- 保存済みの装飾をマスへ寄せるマイグレーション（Issue #445） ---
//
// **このマイグレーションは一度流したら書き換えないので、比べる相手はこのPR（#454）の時点の値に固定する。**
// 今の町・カタログ・家の範囲と比べると、今後それらを変えたときに、関係のないこのテストが落ちる。

test("マイグレーションの 2×2 の装飾の一覧が、このPRの時点のカタログと同じ", () => {
  const sql = snapMigrationSql();
  const listed = [...sql.slice(sql.indexOf("when asset_id in (")).matchAll(/'(decoration-[a-z-]+)'/g)]
    .map((match) => match[1])
    .sort();
  // このPRの時点で、カタログの placement.cells が 2 だった「かざる」の装飾。
  // 後から足した装飾は保存済みの行がまだ無いので、このマイグレーションとは関係ない
  assert.deepEqual(listed, [
    "decoration-bush",
    "decoration-bush-berry",
    "decoration-bush-tall",
    "decoration-bush-wide",
    "decoration-flowerbed",
    "decoration-rock",
    "decoration-rock-flat",
    "decoration-rock-pile",
    "decoration-rock-tall",
    "decoration-tree",
    "decoration-tree-pine",
    "decoration-tree-tall",
    "decoration-tree-young",
  ]);
});

test("マイグレーションの、町の固定物が占めるマスの一覧が、このPRの時点の町と同じ", () => {
  // 比べる相手 tests/fixtures/town_blocked_cells_445.json は、このPRの時点の町から次の手順で作った
  // （町の境界の内側の INITIAL_MAP_OBJECTS に getBlockedCells を当て、扉の前には「（扉の前）」を付ける）:
  //   filterObjectsByLocation(INITIAL_MAP_OBJECTS, "town")
  //     .filter((o) => isInsideWorld(o.position.x, o.position.z))
  //     .flatMap((o) => getBlockedCells(o).map((r, i) => [`${o.id}${i ? "（扉の前）" : ""}`, r.col, r.row, r.cols, r.rows]))
  // マイグレーションの values も同じ手順で書き出した。今の町とは比べない（理由は上のコメント）
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/town_blocked_cells_445.json", import.meta.url), "utf8"));
  const sql = snapMigrationSql();
  const start = sql.indexOf("create temporary view town_blocked_cells as");
  const end = sql.indexOf(") as cells(object_id, col, row_index, cols, rows)");
  assert.ok(start >= 0 && end > start, "town_blocked_cells の一覧が見つからない");
  const listed = [...sql.slice(start, end).matchAll(/\('([^']+)', (-?\d+), (-?\d+), (\d+), (\d+)\)/g)]
    .map((match) => [match[1], Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])]);
  assert.equal(listed.length, 312);
  assert.deepEqual(listed, fixture);
});

test("マイグレーションは、このPRの時点の家の中の範囲の装飾を寄せない", () => {
  // このPRの時点の HOUSE_ZONE_BOUNDS（x が -6.3 〜 6.3、z が -80.3 〜 -69.9）
  const sql = snapMigrationSql();
  assert.ok(sql.includes("position_x between -6.3 and 6.3"), "家の中の範囲（x）が違う");
  assert.ok(sql.includes("position_z between -80.3 and -69.9"), "家の中の範囲（z）が違う");
});

test("向きの単位は90度で、ほかのファイルはここから読む", () => {
  assertClose(QUARTER_TURN, Math.PI / 2, "QUARTER_TURN");
});

test("家の中のマスは、床の南西の角をマス(0, 0)の角にする（奥の壁ぎわがマスの境目に来る）", () => {
  assert.equal(HOUSE_GRID_ORIGIN.x, -6);
  assert.equal(HOUSE_GRID_ORIGIN.z, -80);
  // 奥の壁ぎわの点は、家の中のマスの行0（床の奥の端から1マス）へ寄る
  const snapped = snapToCells(-5.9, -79.9, 1);
  assertClose(snapped.x, -5.55, "x");
  assertClose(snapped.z, -79.55, "z");
  // 町の点は、これまでどおり出発地点を基準に寄る
  const town = snapToCells(1.0, -0.1, 1);
  assertClose(town.x, 1.35, "町の x");
  // 家の中のマスと町のマスは、番号が同じでも別のマスとして扱う
  const lamp = { collidable: true, collisionSize: { depth: 0.4, width: 0.4 }, id: "a", interactive: false, model: "decoration-lamp", position: { x: HOUSE_ROOM_CENTER.x, y: 0, z: HOUSE_ROOM_CENTER.z }, type: "decoration" };
  assert.equal(getObjectCells(lamp).grid, "house");
});

test("物が占めるマス: 装飾は大きさと位置から、区画の建物と道は持たせた範囲から、ほかは当たり判定から", () => {
  const decoration = (model, x, z) => ({ collidable: false, id: model, interactive: false, model, position: { x, y: 0, z }, type: "decoration" });
  // 1マスの草むら（当たり判定なし）も1マスを占める
  assert.deepEqual(getObjectCells(decoration("decoration-grass", 0.45, 0.45)), { col: 0, cols: 1, grid: "town", row: 0, rows: 1 });
  // 2×2 の木
  assert.deepEqual(getObjectCells(decoration("decoration-tree", 0, 0)), { col: -1, cols: 2, grid: "town", row: -1, rows: 2 });
  // 町の外の柵は「かざる」の装飾ではなく、当たり判定も持たないので、マスを占めない
  assert.equal(getObjectCells(decoration("decoration-fence", 0, 0)), null);
  // NPC は当たり判定の箱がかかるマス。縁が接しているだけのマスは含めない
  const npc = { collidable: true, collisionSize: { depth: 0.9, width: 0.9 }, id: "npc", interactive: true, model: "character-villager", position: { x: 0.45, y: 0, z: 0.45 }, type: "npc" };
  assert.deepEqual(getObjectCells(npc), { col: 0, cols: 1, grid: "town", row: 0, rows: 1 });
  // 区画の建物は区画そのものと、扉の前の1行を置けないマスにする
  const bank = INITIAL_MAP_OBJECTS.find((object) => object.id === "bank-building");
  const blocked = getBlockedCells(bank);
  assert.deepEqual(blocked[0], { col: bank.footprint.col, cols: 4, grid: "town", row: bank.footprint.row, rows: 4 });
  assert.deepEqual(blocked[1], { col: bank.footprint.col, cols: 4, grid: "town", row: bank.footprint.row + 4, rows: 1 });
  // 縁が接しているだけの範囲は重ならない
  assert.equal(cellRangesOverlap(blocked[0], { col: bank.footprint.col - 1, cols: 1, grid: "town", row: bank.footprint.row, rows: 1 }), false);
});
