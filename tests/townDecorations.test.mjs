import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { checkMove } from "../lib/rpg-hub/decorationEdit.ts";
import {
  applyFurnitureLayouts,
  findEditableAt,
  isDefaultObjectId,
  isEditableId,
  isStorableDefaultObjectId,
} from "../lib/rpg-hub/houseFurniture.ts";
import { INITIAL_MAP_OBJECTS, TOWN_DECORATION_ASSETS } from "../lib/rpg-hub/mapObjects.ts";
import { MAX_PLACED_DECORATIONS } from "../lib/rpg-hub/placement.ts";
import { isTownDecorationId, placeTownDecorationAt } from "../lib/rpg-hub/townDecorations.ts";
import { getObjectCells } from "../lib/rpg-hub/townGrid.ts";
import { formatTownDecorationInsert } from "../scripts/print-town-decoration-sql.mjs";

/**
 * 我が家タウンに最初からある飾り（木・岩・花壇・低木・草むら・街灯と、散らした自然物）を、
 * かざるの編集モードで動かす・回す・しまう（Issue #509）。
 *
 * いちばん大事なのは、**アプリの一覧・DBの一覧・散らした物の並びがずれないこと**。
 * ずれると、しまえるはずの物がしまえない、保存した配置が別の物に付く、といったことが静かに起きる。
 */

const byId = (id) => INITIAL_MAP_OBJECTS.find((object) => object.id === id);
/** 町なかのプレイヤー（出発地点） */
const PLAYER = { x: 0, z: 0 };
/** 数がほぼ同じか */
const near = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * マイグレーションで house_furniture_items に入れた行のうち、町の飾りのもの（id と、しまったときに入る装飾）。
 * どのマイグレーションで足しても拾えるよう、全ファイルから集める。
 */
function readTownDecorationRowsFromMigrations() {
  const directory = "supabase/migrations";
  const rows = {};
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
    const sql = readFileSync(`${directory}/${name}`, "utf8");
    for (const insert of sql.matchAll(/insert into public\.house_furniture_items\(furniture_id, stored_asset_id\) values([\s\S]*?);/g)) {
      for (const match of insert[1].matchAll(/\('([^']+)', (?:null|'([^']+)')\)/g)) {
        if (isTownDecorationId(match[1])) rows[match[1]] = match[2] ?? null;
      }
    }
  }
  return rows;
}

test("DBの一覧（house_furniture_items）と、アプリの町の飾りの一覧が同じ", () => {
  // ずれたら `npm run town-decorations:sql` で書き出し直し、新しいマイグレーションで足す・消す
  assert.deepEqual(readTownDecorationRowsFromMigrations(), { ...TOWN_DECORATION_ASSETS });
});

test("書き出すSQLは、一覧のすべての行を1つの insert にする", () => {
  const sql = formatTownDecorationInsert({ "scatter-0-1": "decoration-tree", "rock-north": "decoration-rock" });
  assert.equal(
    sql,
    [
      "insert into public.house_furniture_items(furniture_id, stored_asset_id) values",
      "('rock-north', 'decoration-rock'),",
      "('scatter-0-1', 'decoration-tree');",
    ].join("\n"),
  );
});

test("町の飾りは、手で置いた50個と散らした200個。道・建物・柵の外の森と茂みは入らない", () => {
  const ids = Object.keys(TOWN_DECORATION_ASSETS);
  assert.equal(ids.filter((id) => id.startsWith("scatter-")).length, 200);
  assert.equal(ids.length, 250);
  for (const id of ["tasks-building", "bulletin-board", "path-south-0", "fence-west-0", "forest-west-0-0", "hedge-east-0-0", "npc-guide", "house-sofa"]) {
    assert.ok(byId(id), `${id} がマップにない（テストの前提が変わった）`);
    assert.equal(id in TOWN_DECORATION_ASSETS, false, id);
  }
});

test("id の形での判定（シーンからも使う）が、町の飾りの一覧とぴったり同じ", () => {
  for (const object of INITIAL_MAP_OBJECTS) {
    assert.equal(isTownDecorationId(object.id), object.id in TOWN_DECORATION_ASSETS, object.id);
  }
  assert.ok(!isTownDecorationId("scatter-1"), "散らした物の id の形でない");
  assert.ok(!isTownDecorationId("placed-tree-1"));
});

test("町の飾りは選べて、しまえる。しまうと入る装飾は、見た目と同じで「かざる」から置ける", () => {
  const placeable = getPlaceableDecorations();
  for (const [id, assetId] of Object.entries(TOWN_DECORATION_ASSETS)) {
    assert.equal(byId(id).model, assetId, id);
    assert.ok(placeable.includes(assetId), `${assetId} を置けない`);
    assert.ok(isEditableId(id) && isDefaultObjectId(id) && isStorableDefaultObjectId(id), id);
  }
  // 家の中の家具は今までどおり。クローゼットはしまえない
  assert.ok(isStorableDefaultObjectId("house-sofa"));
  assert.ok(isDefaultObjectId("house-closet") && !isStorableDefaultObjectId("house-closet"));
});

test("散らした物の並び（id・見た目・位置・向き・大きさ）は変わらない（変えると保存した配置がずれる）", () => {
  // 散らし方（mapObjects.ts の scatterNature）や町なかの物を変えて、ここが落ちたら、
  // 利用者が動かした・しまった配置が別の物に付いてしまう。並びを変えない形に直すこと
  const rows = INITIAL_MAP_OBJECTS.filter((object) => object.id in TOWN_DECORATION_ASSETS).map((object) =>
    [
      object.id,
      object.model,
      object.position.x.toFixed(3),
      object.position.z.toFixed(3),
      (object.rotationY ?? 0).toFixed(3),
      (object.scale ?? 1).toFixed(3),
    ].join(","),
  );
  const fingerprint = createHash("sha256").update(rows.join("\n")).digest("hex");
  assert.equal(fingerprint, "053c90269952d7353fd93e75fc8b3dc8ea618fb03ab6a3479fe0d02e61ae006c");
});

test("置き直しても大きさと高さは変わらず、位置はマスに、向きは90度刻みにそろう", () => {
  const tree = byId("scatter-0-1");
  const moved = placeTownDecorationAt(tree, { x: tree.position.x + 2.03, z: tree.position.z - 0.95 }, 1.4);
  assert.equal(moved.scale, tree.scale);
  assert.equal(moved.position.y, tree.position.y);
  assert.equal(moved.rotationY, Math.PI / 2);
  // 同じ大きさのマスを占める（向きを変えても正方形なので変わらない）
  const before = getObjectCells(tree);
  const after = getObjectCells(moved);
  assert.equal(after.cols, before.cols);
  assert.equal(after.rows, before.rows);
  assert.notEqual(after.col, before.col);
});

test("保存された位置と向きをマップに反映し、しまった飾りは出さない", () => {
  const tree = byId("tree-north");
  const objects = applyFurnitureLayouts(INITIAL_MAP_OBJECTS, [
    { furnitureId: "tree-north", rotationY: Math.PI, x: tree.position.x - 1.8, z: tree.position.z },
    { furnitureId: "scatter-1-3", rotationY: 0, stored: true, x: 0, z: 0 },
    // 町の飾りでない物の行は無視する（建物は動かない）
    { furnitureId: "tasks-building", rotationY: 0, x: 0, z: 0 },
  ]);
  const moved = objects.find((object) => object.id === "tree-north");
  assert.ok(near(moved.position.x, tree.position.x - 1.8));
  assert.equal(moved.rotationY, Math.PI);
  assert.equal(moved.scale, tree.scale);
  assert.equal(objects.some((object) => object.id === "scatter-1-3"), false);
  assert.deepEqual(
    objects.find((object) => object.id === "tasks-building"),
    byId("tasks-building"),
  );
  assert.equal(objects.length, INITIAL_MAP_OBJECTS.length - 1);
});

test("町の飾りは、マスのどこを押しても選べる", () => {
  const rock = byId("rock-northwest");
  assert.equal(findEditableAt(INITIAL_MAP_OBJECTS, rock.position.x, rock.position.z), "rock-northwest");
});

test("空いている所へは動かせる。置いた装飾が上限まであっても動かせる（置いた数に入らない）", () => {
  const tree = byId("tree-north");
  // 西へ2マス（東は町の外へ延びる道にかかる）
  const point = { x: tree.position.x - 1.8, z: tree.position.z };
  const result = checkMove("tree-north", point, INITIAL_MAP_OBJECTS, PLAYER, MAX_PLACED_DECORATIONS);
  assert.equal(result.rejection, null);
  assert.equal(result.candidate.id, "tree-north");
  assert.ok(near(result.candidate.position.x, point.x));
});

test("道・建物の上には動かせない（入口や道をふさがない）", () => {
  // 中央の道（出発地点のすぐ北）と、銀行の真ん中
  const bank = byId("bank-building");
  for (const point of [{ x: 0, z: 1.35 }, { x: bank.position.x, z: bank.position.z }]) {
    assert.notEqual(checkMove("tree-north", point, INITIAL_MAP_OBJECTS, PLAYER, 0).rejection, null, JSON.stringify(point));
  }
});

test("町の飾りでも置いた装飾でもない物は、動かせない", () => {
  for (const id of ["fence-west-0", "path-south-0", "bank-building"]) {
    assert.equal(checkMove(id, { x: 5, z: 5 }, INITIAL_MAP_OBJECTS, PLAYER, 0).rejection, "blocked", id);
  }
});
