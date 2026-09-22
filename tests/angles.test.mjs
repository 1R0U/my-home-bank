import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAngle, turnToward } from "../lib/rpg-hub/angles.ts";

test("normalizeAngle は -π 〜 π に収める", () => {
  assert.ok(Math.abs(normalizeAngle(0)) < 1e-12);
  assert.ok(Math.abs(normalizeAngle(Math.PI * 2)) < 1e-12);
  // ちょうど半回転は +π と -π のどちらでも同じ向きなので、絶対値で確かめる
  assert.ok(Math.abs(Math.abs(normalizeAngle(Math.PI * 3)) - Math.PI) < 1e-12);
  assert.ok(Math.abs(Math.abs(normalizeAngle(-Math.PI * 3)) - Math.PI) < 1e-12);
  for (const angle of [-40, -7.3, -1, 0, 1, 7.3, 40]) {
    const wrapped = normalizeAngle(angle);
    assert.ok(wrapped >= -Math.PI - 1e-12 && wrapped <= Math.PI + 1e-12, `${angle} -> ${wrapped}`);
  }
});

test("turnToward は上限を超えて回らない", () => {
  assert.ok(Math.abs(turnToward(0, 1.5, 0.2) - 0.2) < 1e-12);
  assert.ok(Math.abs(turnToward(0, -1.5, 0.2) + 0.2) < 1e-12);
  // ちょうど真後ろはどちらへ回ってもよいので、回る量だけを見る
  assert.ok(Math.abs(Math.abs(turnToward(0, Math.PI, 0.2)) - 0.2) < 1e-12);
});

test("turnToward は届くなら目標そのものを返す", () => {
  assert.ok(Math.abs(turnToward(0, 0.1, 0.5) - 0.1) < 1e-12);
  assert.ok(Math.abs(turnToward(1.2, 1.2, 0) - 1.2) < 1e-12);
});

test("turnToward は近いほうへ回る（±π をまたぐ）", () => {
  // 179度から -179度へ。遠回り（-358度）ではなく、近回り（+2度）で π を越える
  const from = Math.PI - 0.02;
  const next = turnToward(from, -Math.PI + 0.02, 0.01);

  assert.ok(next > from || next < -Math.PI + 0.1, `遠回りしている: ${from} -> ${next}`);
});

test("turnToward の戻り値も -π 〜 π に収まる", () => {
  for (const [current, target] of [[3.1, -3.1], [-3.1, 3.1], [0, 6], [6, 0]]) {
    const next = turnToward(current, target, 0.3);
    assert.ok(next >= -Math.PI - 1e-12 && next <= Math.PI + 1e-12, `${current}->${target}: ${next}`);
  }
});
