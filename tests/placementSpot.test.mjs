import assert from "node:assert/strict";
import test from "node:test";
import { getDecorationPlacement, groundedY } from "../lib/rpg-hub/catalog.ts";
import {
  PLACE_DISTANCE,
  createPlacementCandidate,
  isPlacementSpotBlocked,
} from "../lib/rpg-hub/placementSpot.ts";
import { snapToCells } from "../lib/rpg-hub/townGrid.ts";

/**
 * 置く場所の計算。置く操作と、3Dシーンに出す置き場所の目印の両方が使うので、
 * ここがずれると「目印では置けると出ているのに置けない」が起きる。
 */

test("候補はプレイヤーの正面のマスに、装飾の大きさと高さで作られる", () => {
  // ランプは1マスの装飾（しげみ・岩・木は 2×2）
  const candidate = createPlacementCandidate("decoration-lamp", { x: 2, z: -1 }, 0);
  const placement = getDecorationPlacement("decoration-lamp");
  // 正面の点 (2, 0.6) が入っているマスの中心（Issue #445）
  const cell = snapToCells(2, -1 + PLACE_DISTANCE, 1);

  assert.ok(Math.abs(candidate.position.x - cell.x) < 1e-9);
  assert.ok(Math.abs(candidate.position.z - cell.z) < 1e-9);
  assert.ok(Math.abs(candidate.position.x - 2.25) < 1e-9);
  assert.ok(Math.abs(candidate.position.z - 0.45) < 1e-9);
  assert.equal(candidate.position.y, groundedY(placement.halfHeight, 1));
  assert.equal(candidate.collidable, true);
  assert.deepEqual(candidate.collisionSize, { depth: placement.size, width: placement.size });
});

test("2×2 マスの花壇は、正面の点にいちばん近いマスの角を中心にする", () => {
  const candidate = createPlacementCandidate("decoration-flowerbed", { x: 2, z: -1 }, 0);
  const cell = snapToCells(2, -1 + PLACE_DISTANCE, 2);

  assert.ok(Math.abs(candidate.position.x - cell.x) < 1e-9);
  assert.ok(Math.abs(candidate.position.z - cell.z) < 1e-9);
  assert.ok(Math.abs(candidate.position.x - 1.8) < 1e-9);
  assert.ok(Math.abs(candidate.position.z - 0.9) < 1e-9);
});

test("向きはプレイヤーの向きにいちばん近い90度刻みにする", () => {
  const near = (facingY) => createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, facingY).rotationY;

  assert.ok(Math.abs(near(0.3)) < 1e-9);
  assert.ok(Math.abs(near(1.3) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(near(-2) - -Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(near(3) - Math.PI) < 1e-9);
});

test("踏んで歩ける装飾は、当たり判定を持たない候補になる", () => {
  const candidate = createPlacementCandidate("decoration-grass", { x: 0, z: 0 }, 0);

  assert.equal(candidate.collidable, false);
  assert.equal(candidate.collisionSize, undefined);
});

test("装飾でないIDからは候補を作らない", () => {
  assert.equal(createPlacementCandidate("building-bank", { x: 0, z: 0 }, 0), null);
  assert.equal(createPlacementCandidate("not-an-asset", { x: 0, z: 0 }, 0), null);
});

test("何も無い場所なら、置き場所はふさがっていない", () => {
  const candidate = createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, 0);

  assert.equal(isPlacementSpotBlocked(candidate, [], { x: 0, z: 0 }), false);
});

test("置き場所に物があれば、ふさがっている", () => {
  const candidate = createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, 0);
  const rock = { ...candidate, id: "placed-rock" };

  assert.equal(isPlacementSpotBlocked(candidate, [rock], { x: 0, z: 0 }), true);
});

test("1マスには装飾を1つしか置けない。踏んで歩ける装飾でも同じ（Issue #445）", () => {
  const rock = { ...createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, 0), id: "placed-rock" };
  const grass = createPlacementCandidate("decoration-grass", { x: 0, z: 0 }, 0);
  const grassOnRock = { ...grass, id: "placed-grass" };

  // 岩のマスに草むらは置けない。草むらのマスにも岩は置けない
  assert.equal(isPlacementSpotBlocked(grass, [rock], { x: 0, z: 0 }), true);
  assert.equal(isPlacementSpotBlocked(rock, [grassOnRock], { x: 5, z: 5 }), true);
});

test("隣のマスの装飾は、置く邪魔にならない", () => {
  const rock = { ...createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, 0), id: "placed-rock" };
  // 1マス東を向いて置く
  const grass = createPlacementCandidate("decoration-grass", { x: 0.9, z: 0 }, 0);

  assert.equal(isPlacementSpotBlocked(grass, [rock], { x: 0.9, z: 0 }), false);
});

test("2×2 マスの花壇は、占める4マスのどこかに装飾があれば置けない", () => {
  const flowerbed = createPlacementCandidate("decoration-flowerbed", { x: 0, z: 0 }, 0);
  const inside = {
    ...createPlacementCandidate("decoration-grass", { x: flowerbed.position.x + 0.45, z: 0 }, 0),
    id: "placed-grass",
  };
  const outside = {
    ...createPlacementCandidate("decoration-grass", { x: flowerbed.position.x + 1.35, z: 0 }, 0),
    id: "placed-grass-far",
  };

  assert.equal(isPlacementSpotBlocked(flowerbed, [inside], { x: 9, z: 9 }), true);
  assert.equal(isPlacementSpotBlocked(flowerbed, [outside], { x: 9, z: 9 }), false);
});
