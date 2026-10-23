import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import {
  applyPlacedChange,
  checkMove,
  checkNewPlacement,
  rotateQuarterTurn,
} from "../lib/rpg-hub/decorationEdit.ts";
import { HOUSE_ROOM_CENTER } from "../lib/rpg-hub/houseInterior.ts";
import { HOUSE_ROOM_SIZE } from "../lib/rpg-hub/houseInteriorParts.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { MAX_PLACED_DECORATIONS, createDecorationCandidate } from "../lib/rpg-hub/placement.ts";
import { TOWN_CELL_SIZE } from "../lib/rpg-hub/townGrid.ts";

/**
 * かざるの編集モード（Issue #477）で、指を離したマスに置いてよいか・動かしてよいかの判定。
 *
 * 3Dシーンの目印は軽い判定しか見ないので、**置いたあとに建物へ行けるか**を含めた最終判断は
 * ここで行う。ここが緩いと、引っぱって置くだけで家の出口を塞いで詰んでしまう。
 */

/** 家の中のプレイヤー。部屋のまん中より少し手前に立たせる */
const PLAYER = { x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z + 2.5 };
/** 家の中の、何も無いはずの場所 */
const FREE_POINT = { x: HOUSE_ROOM_CENTER.x - 2, z: HOUSE_ROOM_CENTER.z };

/**
 * 置いた装飾を作る（DBから読んだものと同じく `placed-` で始まるid）。
 * @param assetId - 装飾
 * @param point - 置く場所
 * @param id - id
 * @param rotationY - 向き
 */
const placed = (assetId, point, id, rotationY = 0) => ({
  ...createDecorationCandidate(assetId, point, rotationY),
  id,
});

test("何も無いマスには、引っぱってきた装飾を置ける。置く場所はマスへ寄せる", () => {
  const result = checkNewPlacement(RPG_HUB_ASSETS.lamp, { x: FREE_POINT.x + 0.1, z: FREE_POINT.z + 0.1 }, INITIAL_MAP_OBJECTS, PLAYER, 0);

  assert.equal(result.rejection, null);
  const snapped = createDecorationCandidate(RPG_HUB_ASSETS.lamp, FREE_POINT);
  assert.equal(result.candidate.position.x, snapped.position.x);
  assert.equal(result.candidate.position.z, snapped.position.z);
});

test("置いた装飾のマスには、引っぱってきた装飾を置けない", () => {
  const rock = placed(RPG_HUB_ASSETS.rock, FREE_POINT, "placed-rock");

  const result = checkNewPlacement(RPG_HUB_ASSETS.lamp, FREE_POINT, [...INITIAL_MAP_OBJECTS, rock], PLAYER, 1);
  assert.equal(result.rejection, "blocked");
});

test("置ける数の上限に達していたら、新しく置けない", () => {
  const result = checkNewPlacement(RPG_HUB_ASSETS.lamp, FREE_POINT, INITIAL_MAP_OBJECTS, PLAYER, MAX_PLACED_DECORATIONS);

  assert.equal(result.rejection, "limit");
});

test("家の床の外へ引っぱっても置けない", () => {
  // 家の中のプレイヤーのまま、床の右の縁（x = 6）の外を指したとき
  const outside = { x: HOUSE_ROOM_CENTER.x + HOUSE_ROOM_SIZE.width / 2 + 0.5, z: HOUSE_ROOM_CENTER.z };
  const result = checkNewPlacement(RPG_HUB_ASSETS.lamp, outside, INITIAL_MAP_OBJECTS, PLAYER, 0);

  assert.notEqual(result.rejection, null);
});

test("カタログに無い装飾は置けない", () => {
  const result = checkNewPlacement("decoration-unknown", FREE_POINT, INITIAL_MAP_OBJECTS, PLAYER, 0);

  assert.equal(result.candidate, null);
  assert.equal(result.rejection, "blocked");
});

test("動かす装飾そのものは判定から外す。元のマスと重なる隣のマスへずらせる", () => {
  // 2×2 マスの岩を1マスだけ東へずらす。元の岩を数えると、重なる2マスが埋まっていることになる
  const rock = placed(RPG_HUB_ASSETS.rock, FREE_POINT, "placed-rock");
  const objects = [...INITIAL_MAP_OBJECTS, rock];
  const target = { x: rock.position.x + TOWN_CELL_SIZE, z: rock.position.z };

  const result = checkMove("placed-rock", target, objects, PLAYER, 1);
  assert.equal(result.rejection, null);
  assert.equal(result.candidate.id, "placed-rock");
  assert.ok(Math.abs(result.candidate.position.x - target.x) < 1e-9);
});

test("動かす先に別の装飾があれば動かせない", () => {
  const rock = placed(RPG_HUB_ASSETS.rock, FREE_POINT, "placed-rock");
  const lamp = placed(RPG_HUB_ASSETS.lamp, { x: FREE_POINT.x + 3, z: FREE_POINT.z }, "placed-lamp");
  const objects = [...INITIAL_MAP_OBJECTS, rock, lamp];

  const result = checkMove("placed-lamp", FREE_POINT, objects, PLAYER, 2);
  assert.equal(result.rejection, "blocked");
});

test("上限ちょうど置いてあっても、置き直すだけなので動かせる", () => {
  const lamp = placed(RPG_HUB_ASSETS.lamp, FREE_POINT, "placed-lamp");
  const target = { x: FREE_POINT.x, z: FREE_POINT.z - TOWN_CELL_SIZE };

  const result = checkMove("placed-lamp", target, [...INITIAL_MAP_OBJECTS, lamp], PLAYER, MAX_PLACED_DECORATIONS);
  assert.equal(result.rejection, null);
});

test("動かしても向きは変えない", () => {
  const lamp = placed(RPG_HUB_ASSETS.lamp, FREE_POINT, "placed-lamp", Math.PI);
  const target = { x: FREE_POINT.x, z: FREE_POINT.z - TOWN_CELL_SIZE };

  const result = checkMove("placed-lamp", target, [...INITIAL_MAP_OBJECTS, lamp], PLAYER, 1);
  assert.ok(Math.abs(result.candidate.rotationY - Math.PI) < 1e-9);
});

test("町の固定物や、見つからない物は動かせない", () => {
  const fixed = INITIAL_MAP_OBJECTS.find((object) => object.type === "decoration");

  assert.equal(checkMove(fixed.id, FREE_POINT, INITIAL_MAP_OBJECTS, PLAYER, 0).rejection, "blocked");
  assert.equal(checkMove("placed-missing", FREE_POINT, INITIAL_MAP_OBJECTS, PLAYER, 0).rejection, "blocked");
});

test("「まわす」を押すたびに90度ずつ回り、4回で元の向きに戻る", () => {
  let rotation = 0;
  const seen = [];
  for (let index = 0; index < 4; index += 1) {
    rotation = rotateQuarterTurn(rotation);
    seen.push(rotation);
  }
  const expected = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
  seen.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9, `${index}: ${value}`));
});

test("90度刻みでない向き（昔の自由な向き）からは、近い90度刻みから回す", () => {
  assert.ok(Math.abs(rotateQuarterTurn(0.2) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(rotateQuarterTurn(Math.PI / 2 + 0.3) - Math.PI) < 1e-9);
});

test("置いた装飾の書き換えは、指定した装飾の指定した値だけを変える", () => {
  const lamp = placed(RPG_HUB_ASSETS.lamp, FREE_POINT, "placed-lamp");
  const rock = placed(RPG_HUB_ASSETS.rock, { x: FREE_POINT.x + 3, z: FREE_POINT.z }, "placed-rock");

  const rotated = applyPlacedChange([lamp, rock], "placed-lamp", { rotationY: Math.PI });
  assert.equal(rotated[0].rotationY, Math.PI);
  assert.deepEqual(rotated[0].position, lamp.position);
  assert.equal(rotated[1], rock);

  const moved = applyPlacedChange([lamp, rock], "placed-lamp", { x: 1, z: 2 });
  assert.deepEqual(moved[0].position, { ...lamp.position, x: 1, z: 2 });
  assert.equal(moved[0].rotationY, lamp.rotationY);
});
