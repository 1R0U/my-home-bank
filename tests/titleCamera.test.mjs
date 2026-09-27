import assert from "node:assert/strict";
import test from "node:test";
import {
  TITLE_CAMERA_CENTER,
  TITLE_CAMERA_LOOP_MS,
  TITLE_CAMERA_RADIUS,
  getTitleCameraFocus,
} from "../lib/rpg-hub/titleCamera.ts";

test("1周すると同じ点に戻る（ループの継ぎ目でカメラが飛ばない）", () => {
  const start = getTitleCameraFocus(0);
  const oneLoop = getTitleCameraFocus(TITLE_CAMERA_LOOP_MS);
  assert.ok(Math.abs(start.x - oneLoop.x) < 1e-9);
  assert.ok(Math.abs(start.z - oneLoop.z) < 1e-9);
});

test("注視点は楕円の範囲から出ない", () => {
  for (let ms = 0; ms < TITLE_CAMERA_LOOP_MS; ms += 997) {
    const { x, z } = getTitleCameraFocus(ms);
    const dx = (x - TITLE_CAMERA_CENTER.x) / TITLE_CAMERA_RADIUS.x;
    const dz = (z - TITLE_CAMERA_CENTER.z) / TITLE_CAMERA_RADIUS.z;
    assert.ok(Math.abs(dx * dx + dz * dz - 1) < 1e-9);
  }
});

test("半周で楕円の反対側へ動く", () => {
  const start = getTitleCameraFocus(0);
  const half = getTitleCameraFocus(TITLE_CAMERA_LOOP_MS / 2);
  assert.ok(Math.abs(start.z - half.z - TITLE_CAMERA_RADIUS.z * 2) < 1e-9);
});

test("負の値・NaNでは開始位置を返す", () => {
  const start = getTitleCameraFocus(0);
  assert.deepEqual(getTitleCameraFocus(-100), start);
  assert.deepEqual(getTitleCameraFocus(Number.NaN), start);
});
