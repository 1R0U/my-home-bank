import assert from "node:assert/strict";
import test from "node:test";
import { getDecorationPlacement, groundedY } from "../lib/rpg-hub/catalog.ts";
import {
  PLACE_DISTANCE,
  createPlacementCandidate,
  isPlacementSpotBlocked,
} from "../lib/rpg-hub/placementSpot.ts";

/**
 * 置く場所の計算。置く操作と、3Dシーンに出す置き場所の目印の両方が使うので、
 * ここがずれると「目印では置けると出ているのに置けない」が起きる。
 */

test("候補はプレイヤーの正面に、装飾の大きさと高さで作られる", () => {
  const candidate = createPlacementCandidate("decoration-rock", { x: 2, z: -1 }, 0);
  const placement = getDecorationPlacement("decoration-rock");

  assert.equal(candidate.position.x, 2);
  assert.ok(Math.abs(candidate.position.z - (-1 + PLACE_DISTANCE)) < 1e-9);
  assert.equal(candidate.position.y, groundedY(placement.halfHeight, 1));
  assert.equal(candidate.collidable, true);
  assert.deepEqual(candidate.collisionSize, { depth: placement.size, width: placement.size });
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

test("踏んで歩ける装飾は、物の上でもふさがっていない扱いにする", () => {
  const rock = { ...createPlacementCandidate("decoration-rock", { x: 0, z: 0 }, 0), id: "placed-rock" };
  const grass = createPlacementCandidate("decoration-grass", { x: 0, z: 0 }, 0);

  assert.equal(isPlacementSpotBlocked(grass, [rock], { x: 0, z: 0 }), false);
});
