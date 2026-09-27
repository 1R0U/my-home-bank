import assert from "node:assert/strict";
import test from "node:test";
import {
  TITLE_CLOUDS,
  getCloudLateral,
  getCloudPosition,
  getCloudWrapHalfWidth,
} from "../lib/rpg-hub/titleClouds.ts";
import { TITLE_CAMERA_POSITION } from "../lib/rpg-hub/titleCamera.ts";

test("雲は時間とともに流れる速さのぶん動く", () => {
  const cloud = TITLE_CLOUDS[0];
  const start = getCloudLateral(cloud, 0);
  const after = getCloudLateral(cloud, 2000);
  assert.ok(Math.abs(after - start - cloud.speed * 2) < 1e-9);
});

test("範囲の端を越えたら反対側の端から戻ってくる（範囲の外へは出ない）", () => {
  for (const cloud of TITLE_CLOUDS) {
    const half = getCloudWrapHalfWidth(cloud.depth);
    for (let ms = 0; ms < 600_000; ms += 1337) {
      const lateral = getCloudLateral(cloud, ms);
      assert.ok(lateral >= -half && lateral < half, `${lateral} が ±${half} を越えた`);
    }
  }
});

test("1往復ぶんの時間で、同じ位置に戻る", () => {
  const cloud = TITLE_CLOUDS[1];
  const loopMs = ((getCloudWrapHalfWidth(cloud.depth) * 2) / cloud.speed) * 1000;
  assert.ok(Math.abs(getCloudLateral(cloud, 0) - getCloudLateral(cloud, loopMs)) < 1e-6);
});

test("負の値・NaNでは動き始めの位置を返す", () => {
  const cloud = TITLE_CLOUDS[0];
  assert.equal(getCloudLateral(cloud, -100), getCloudLateral(cloud, 0));
  assert.equal(getCloudLateral(cloud, Number.NaN), getCloudLateral(cloud, 0));
});

test("雲はカメラの奥行きどおりの距離に置かれ、左右に流れても奥行きは変わらない", () => {
  for (const cloud of TITLE_CLOUDS) {
    for (const ms of [0, 30_000, 90_000]) {
      const position = getCloudPosition(cloud, ms);
      const lateral = getCloudLateral(cloud, ms);
      const horizontal = Math.hypot(
        position.x - TITLE_CAMERA_POSITION.x,
        position.z - TITLE_CAMERA_POSITION.z,
      );
      // 奥行きと左右は直交しているので、水平距離は三平方の定理どおりになる
      assert.ok(Math.abs(horizontal - Math.hypot(cloud.depth, lateral)) < 1e-9);
      assert.equal(position.y, cloud.height);
    }
  }
});
