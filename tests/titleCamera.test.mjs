import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { overlapsObject } from "../lib/rpg-hub/movement.ts";
import { TITLE_CAMERA_POSITION, TITLE_CAMERA_TARGET } from "../lib/rpg-hub/titleCamera.ts";

test("カメラは建物や木の中に埋まっていない（中に入ると内側しか映らない）", () => {
  for (const object of INITIAL_MAP_OBJECTS) {
    assert.equal(
      overlapsObject(TITLE_CAMERA_POSITION.x, TITLE_CAMERA_POSITION.z, object),
      false,
      `${object.id} の中にカメラがある`,
    );
  }
});

test("建物の正面（+Z 向き）が見えるよう、-Z の方向を向いている", () => {
  assert.ok(TITLE_CAMERA_TARGET.z < TITLE_CAMERA_POSITION.z);
});
