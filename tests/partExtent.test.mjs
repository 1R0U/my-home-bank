import assert from "node:assert/strict";
import test from "node:test";
import { getPartsHalfExtent } from "../lib/rpg-hub/partExtent.ts";

const assertClose = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

const box = (width, depth, position, rotation) => ({
  color: "#000000",
  depth,
  height: 0.2,
  position,
  rotation,
  shape: "box",
  width,
});

test("原点に置いた箱は、幅と奥行きの大きいほうの半分", () => {
  assertClose(getPartsHalfExtent([box(0.6, 0.4, { x: 0, y: 0, z: 0 })]), 0.3, "半分");
});

test("ずらして置いたパーツは、ずらしたぶん遠くまで広がる", () => {
  assertClose(getPartsHalfExtent([box(0.4, 0.4, { x: 0, y: 0, z: -0.5 })]), 0.7, "半分");
});

test("Y軸まわりに45度回した箱は、角が外へ出る", () => {
  const half = getPartsHalfExtent([box(0.4, 0.4, { x: 0, y: 0, z: 0 }, { x: 0, y: Math.PI / 4, z: 0 })]);
  assertClose(half, 0.2 * Math.SQRT2, "半分");
});

test("倒した円錐は、先が倒した向きへ伸びる", () => {
  // 高さ1の円錐をZ軸まわりに90度倒すと、先は横（-X）へ0.5出る
  const cone = {
    color: "#000000",
    diameter: 0.2,
    height: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
    shape: "cone",
    tessellation: 4,
  };
  assertClose(getPartsHalfExtent([cone]), 0.5, "半分");
});

test("球は軸ごとの直径の大きいほうの半分", () => {
  const sphere = {
    color: "#000000",
    diameterX: 0.8,
    diameterY: 0.3,
    diameterZ: 0.5,
    position: { x: 0, y: 0, z: 0 },
    segments: 8,
    shape: "sphere",
  };
  assertClose(getPartsHalfExtent([sphere]), 0.4, "半分");
});
