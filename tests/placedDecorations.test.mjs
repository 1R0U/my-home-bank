import assert from "node:assert/strict";
import test from "node:test";
import { getDecorationPlacement, groundedY } from "../lib/rpg-hub/catalog.ts";
import {
  PLACED_ID_PREFIX,
  toCandidate,
  toPlacedDecorations,
} from "../lib/rpg-hub/placedDecorations.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";

/** `placed_decorations` の1行を作る。 */
const row = (overrides = {}) => ({
  asset_id: "decoration-tree",
  id: "11111111-1111-1111-1111-111111111111",
  position_x: 3,
  position_z: -4,
  rotation_y: 0.5,
  scale: 1.2,
  ...overrides,
});

// --- まっとうな行 ---

test("置いた装飾がマップオブジェクトになる", () => {
  const { errors, objects } = toPlacedDecorations([row()]);

  assert.deepEqual(errors, []);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].type, "decoration");
  assert.equal(objects[0].model, "decoration-tree");
  assert.equal(objects[0].position.x, 3);
  assert.equal(objects[0].position.z, -4);
  assert.equal(objects[0].rotationY, 0.5);
  assert.equal(objects[0].scale, 1.2);
});

test("高さはDBではなくカタログから決まる", () => {
  // 保存すると、形を作り直したときに古い高さのまま宙に浮く
  const placement = getDecorationPlacement("decoration-tree");
  const { objects } = toPlacedDecorations([row({ scale: 2 })]);

  assert.equal(objects[0].position.y, groundedY(placement.halfHeight, 2));
});

test("当たり判定の大きさもカタログから決まる", () => {
  const placement = getDecorationPlacement("decoration-tree");
  const { objects } = toPlacedDecorations([row()]);

  assert.equal(objects[0].collidable, true);
  assert.deepEqual(objects[0].collisionSize, {
    depth: placement.size,
    width: placement.size,
  });
});

test("踏んで歩けるものは当たり判定を持たない", () => {
  // 草むら。collisionSize を付けると通れなくなる
  const { objects } = toPlacedDecorations([row({ asset_id: "decoration-grass" })]);

  assert.equal(objects[0].collidable, false);
  assert.equal(objects[0].collisionSize, undefined);
});

test("numeric が文字列で返ってきても扱える", () => {
  // Supabase の numeric は文字列で返ることがある
  const { errors, objects } = toPlacedDecorations([
    row({ position_x: "3.5", position_z: "-2", rotation_y: "1", scale: "0.8" }),
  ]);

  assert.deepEqual(errors, []);
  assert.equal(objects[0].position.x, 3.5);
  assert.equal(objects[0].scale, 0.8);
});

// --- 壊れた行 ---

test("壊れた行は捨て、残りは表示する", () => {
  // 1行が壊れているせいで庭が丸ごと消えるのが一番まずい
  const { errors, objects } = toPlacedDecorations([
    row({ id: "aaa" }),
    row({ asset_id: "decoration-nonexistent", id: "bbb" }),
    row({ id: "ccc", position_x: "ばなな" }),
    row({ id: "ddd" }),
  ]);

  assert.equal(objects.length, 2, "まっとうな2件が残るはず");
  assert.deepEqual(
    objects.map((object) => object.id),
    [`${PLACED_ID_PREFIX}aaa`, `${PLACED_ID_PREFIX}ddd`],
  );
  assert.equal(errors.length, 2, "捨てた行の理由が返るはず");
});

test("カタログに無いアセットIDは弾く", () => {
  // カタログから消したアセットが保存されたままでも、画面を壊さない
  const { errors, objects } = toPlacedDecorations([row({ asset_id: "decoration-nonexistent" })]);

  assert.deepEqual(objects, []);
  assert.ok(errors.some((error) => error.includes("model")), errors.join(" / "));
});

test("装飾ではないアセットIDも弾く", () => {
  // 建物やキャラクターを庭に置けてしまわないこと
  for (const assetId of ["building-bank", "character-villager", "player-default"]) {
    const { objects } = toPlacedDecorations([row({ asset_id: assetId })]);
    assert.deepEqual(objects, [], `${assetId} が通ってしまった`);
  }
});

test("同じIDの行が2つあっても、片方だけ残す", () => {
  const { errors, objects } = toPlacedDecorations([row(), row()]);

  assert.equal(objects.length, 1);
  assert.ok(errors.some((error) => error.includes("重複")), errors.join(" / "));
});

test("行が空でも落ちない", () => {
  assert.deepEqual(toPlacedDecorations([]), { errors: [], objects: [] });
});

// --- 町の固定物とぶつからない ---

test("置いた装飾のIDは、町の固定物とぶつからない", () => {
  // 重複すると parseMapObjects がどちらかを捨てる
  const townIds = new Set(INITIAL_MAP_OBJECTS.map((object) => object.id));

  for (const id of townIds) {
    assert.ok(
      !id.startsWith(PLACED_ID_PREFIX),
      `町の固定物が置いた装飾の接頭辞を使っている: ${id}`,
    );
  }

  const { objects } = toPlacedDecorations([row()]);
  assert.ok(!townIds.has(objects[0].id));
});

test("町の固定物と並べても、全部のIDが一意になる", () => {
  const placed = toPlacedDecorations([row({ id: "x" }), row({ id: "y" })]).objects;
  const ids = [...INITIAL_MAP_OBJECTS, ...placed].map((object) => object.id);

  assert.equal(new Set(ids).size, ids.length);
});

// --- 候補を作る段階 ---

test("未知のアセットIDでも候補は作る（弾くのは検証側の仕事）", () => {
  // 判定を2か所に分けると、片方だけ緩くなる
  const candidate = toCandidate(row({ asset_id: "decoration-nonexistent" }));

  assert.equal(candidate.model, "decoration-nonexistent");
  assert.equal(candidate.collidable, false);
  assert.equal(candidate.collisionSize, undefined);
});
