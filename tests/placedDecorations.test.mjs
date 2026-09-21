import assert from "node:assert/strict";
import test from "node:test";
import { getDecorationPlacement, groundedY } from "../lib/rpg-hub/catalog.ts";
import {
  PLACED_ID_PREFIX,
  toCandidate,
  toPlacedDecorations,
} from "../lib/rpg-hub/placedDecorations.ts";
import { getHouseRoomCenters, INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";

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

// --- 家の中（Issue #244） ---

/** 家族2人ぶんの部屋。持ち主のid → 部屋の中心。 */
const ROOM_CENTERS = getHouseRoomCenters(["owner-a", "owner-b"]);

test("家の中の装飾は、その家の部屋の中心からの相対座標で置かれる", () => {
  // 保存するのは部屋の中の位置だけ。部屋の並べ方を変えても、置いたものは部屋に残る
  const { errors, objects } = toPlacedDecorations(
    [row({ position_x: 1, position_z: -2, room_owner_id: "owner-b" })],
    ROOM_CENTERS,
  );

  assert.deepEqual(errors, []);
  assert.equal(objects[0].position.x, ROOM_CENTERS["owner-b"].x + 1);
  assert.equal(objects[0].position.z, ROOM_CENTERS["owner-b"].z - 2);
});

test("持ち主ごとに別の部屋へ置かれる", () => {
  // 父の家の内装と母の家の内装が混ざらないこと
  const { objects } = toPlacedDecorations(
    [
      row({ id: "a", room_owner_id: "owner-a" }),
      row({ id: "b", room_owner_id: "owner-b" }),
    ],
    ROOM_CENTERS,
  );

  assert.notEqual(objects[0].position.x, objects[1].position.x);
});

test("町・庭（room_owner_id が null）はワールド座標のまま", () => {
  const { objects } = toPlacedDecorations([row({ room_owner_id: null })], ROOM_CENTERS);

  assert.equal(objects[0].position.x, 3);
  assert.equal(objects[0].position.z, -4);
});

test("部屋が分からない持ち主の行は捨てる", () => {
  // 家族から外れた人の行など。置き場所が決まらないので、町のどこかへ出さない
  const { errors, objects } = toPlacedDecorations(
    [row({ room_owner_id: "owner-unknown" })],
    ROOM_CENTERS,
  );

  assert.deepEqual(objects, []);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("家が見つかりません"), errors[0]);
});
