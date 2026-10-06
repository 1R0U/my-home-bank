import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMB_SWING_ANGLE,
  WALK_CYCLE,
  getLimbSwing,
  getWalkBob,
  stepWalkPhase,
} from "../lib/rpg-hub/walkCycle.ts";
import { getBodyLift } from "../lib/rpg-hub/playerMotion.ts";
import { getNpcBodyLift } from "../lib/rpg-hub/npcWander.ts";
import { getBuildingParts } from "../lib/rpg-hub/catalog.ts";
import { CHARACTER_TYPE_ASSET_IDS, CHARACTER_TYPES } from "../lib/rpg-hub/characterTypes.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { PLAYER_SCALE } from "../lib/rpg-hub/movement.ts";

// 歩く動作の周期（Issue #377）。プレイヤーと住人で共通の、手足の振り方と止まり方を確かめる。

/** 位相の誤差（π が浮動小数で sin(π) ≒ 1e-16 になるぶん）。 */
const EPSILON = 1e-9;

/** 確かめに使う位相の進む速さ（ラジアン / ミリ秒）。 */
const SPEED = 0.01;

/**
 * 歩くときに手足を振るキャラクター。体の弾み（ワールド座標）と、描くときの拡大率も持つ。
 * 住人はマップデータの `scale` で拡大・縮小できるので、1以外の拡大率でも確かめる（PR #378 レビュー対応）。
 * 拡大率1のときだけ確かめていると、拡大した住人で足が潜っても気づけない。
 */
const WALKERS = [
  ...CHARACTER_TYPES.map((type) => ({
    assetId: CHARACTER_TYPE_ASSET_IDS[type],
    bodyLift: (walkPhase) => getBodyLift({ facingY: 0, walkPhase }),
    name: type,
    scale: PLAYER_SCALE,
  })),
  ...[0.6, 1, 1.5, 3].map((scale) => ({
    assetId: RPG_HUB_ASSETS.villager,
    bodyLift: (walkPhase) => getNpcBodyLift({ walkPhase }, scale),
    name: `villager(scale=${scale})`,
    scale,
  })),
];

// --- 手足の振り方 ---

test("左右の足は互い違いに振る", () => {
  // 1歩目の真ん中（位相 π/2）。左右どちらかの足が一番前、もう一方が一番後ろ
  const left = getLimbSwing(Math.PI / 2, "foot", -1);
  const right = getLimbSwing(Math.PI / 2, "foot", 1);

  assert.ok(Math.abs(left + right) < EPSILON, "左右が逆に振れていない");
  assert.ok(Math.abs(Math.abs(left) - LIMB_SWING_ANGLE.foot) < EPSILON, `swing=${left}`);
});

test("手は同じ側の足と逆に振る（右足が前なら右手は後ろ）", () => {
  // 2歩目の途中（位相 3π/2）でも、1歩目と同じ関係になる
  for (const walkPhase of [Math.PI / 2, (Math.PI * 3) / 2]) {
    for (const side of [-1, 1]) {
      const foot = getLimbSwing(walkPhase, "foot", side);
      const hand = getLimbSwing(walkPhase, "hand", side);
      assert.ok(Math.sign(foot) === -Math.sign(hand), `side=${side} foot=${foot} hand=${hand}`);
      assert.ok(Math.abs(Math.abs(hand) - LIMB_SWING_ANGLE.hand) < EPSILON);
    }
  }
});

test("2歩目は1歩目と逆の足を前へ出す", () => {
  const firstStep = getLimbSwing(Math.PI / 2, "foot", 1);
  const secondStep = getLimbSwing((Math.PI * 3) / 2, "foot", 1);

  assert.ok(Math.abs(firstStep + secondStep) < EPSILON);
});

test("体の真ん中のパーツ（side = 0）は振らない", () => {
  assert.ok(Math.abs(getLimbSwing(Math.PI / 2, "foot", 0)) < EPSILON);
  assert.ok(Math.abs(getLimbSwing(Math.PI / 2, "hand", 0)) < EPSILON);
});

test("手足がそろう位相（0 と π）では、振りも弾みも0になる", () => {
  for (const walkPhase of [0, Math.PI]) {
    assert.ok(getWalkBob(walkPhase, 1) < EPSILON);
    for (const limb of ["foot", "hand"]) {
      for (const side of [-1, 1]) {
        assert.ok(Math.abs(getLimbSwing(walkPhase, limb, side)) < EPSILON, `${walkPhase} ${limb} ${side}`);
      }
    }
  }
});

// --- 位相の進め方 ---

test("動いている間は 0 〜 2π を回り続ける", () => {
  let phase = 0;
  let cycles = 0;

  for (let index = 0; index < 300; index += 1) {
    const before = phase;
    phase = stepWalkPhase(phase, 16, true, SPEED);
    if (phase < before) cycles += 1;
    assert.ok(phase >= 0 && phase < WALK_CYCLE, `phase=${phase}`);
  }

  assert.ok(cycles >= 2, `周回数=${cycles}`);
});

test("止まると、今の1歩の終わり（π か 0）で止まり、そこから動かない", () => {
  for (const [from, end] of [
    [Math.PI * 0.3, Math.PI],
    [Math.PI * 1.3, 0],
  ]) {
    let phase = from;
    for (let index = 0; index < 100; index += 1) {
      phase = stepWalkPhase(phase, 16, false, SPEED);
    }
    assert.equal(phase, end, `from=${from}`);
  }
});

test("止まっている位相（0 と π）からは、何度呼んでも動かない", () => {
  for (const phase of [0, Math.PI]) {
    let current = phase;
    for (let index = 0; index < 50; index += 1) {
      current = stepWalkPhase(current, 16, false, SPEED);
    }
    assert.equal(current, phase);
  }
});

test("止まりきっていない位相は、π にごく近くても止まる位相まで進める", () => {
  // π の倍数かを剰余で判定していると、計算で求めた π 近くの値を「止まっている」と取り違えたり、
  // 逆に取りこぼしたりする。止まるのは 0 と Math.PI ちょうどのときだけ
  const almostPi = Math.PI - 1e-12;
  const next = stepWalkPhase(almostPi, 16, false, SPEED);

  assert.equal(next, Math.PI);
});

test("速さを変えると、1歩にかかる時間が変わる", () => {
  const slow = stepWalkPhase(0, 100, true, SPEED);
  const fast = stepWalkPhase(0, 100, true, SPEED * 2);

  assert.ok(Math.abs(fast - slow * 2) < EPSILON);
});

// --- キャラクターごとの手足（パーツ定義の付け根） ---

test("歩くキャラクターはすべて、左右の足と手を持つ", () => {
  for (const walker of WALKERS) {
    const kinds = new Set(
      getBuildingParts(walker.assetId)
        .filter((part) => part.limb)
        .map((part) => `${part.limb.kind}:${Math.sign(part.position.x)}`),
    );
    assert.deepEqual([...kinds].sort(), ["foot:-1", "foot:1", "hand:-1", "hand:1"], walker.name);
  }
});

test("手足の付け根はパーツの中心より上にあり、手足は回転を持たない", () => {
  // 付け根はパーツの中心の真上に置く前提（partMesh.ts の prepareLimbMeshes）。
  // 回転を持つパーツだと、メッシュの座標で指定した軸がずれる
  for (const walker of WALKERS) {
    for (const part of getBuildingParts(walker.assetId).filter((item) => item.limb)) {
      assert.ok(part.limb.pivotY > part.position.y, `${walker.name} の付け根が中心より下`);
      assert.equal(part.rotation, undefined, `${walker.name} の手足に回転がある`);
    }
  }
});

test("住人の腕と手は、同じ側なら同じ肩を軸に一緒に振れる", () => {
  // 住人は腕と手が別パーツ。軸がずれると、振ったときに手が腕から外れて見える
  const hands = getBuildingParts(RPG_HUB_ASSETS.villager).filter((part) => part.limb?.kind === "hand");
  for (const side of [-1, 1]) {
    const pivots = new Set(
      hands.filter((part) => Math.sign(part.position.x) === side).map((part) => part.limb.pivotY),
    );
    assert.equal(pivots.size, 1, `side=${side} の腕と手で軸が違う`);
  }
});

test("足を振っても、足の角が地面より下へ潜らない", () => {
  // 足（箱）を付け根で回すと、前後の下の角が付け根から遠くなり、少し下がることがある。
  // そのぶん体が弾んで持ち上がるので、差し引きで地面（足底）より下へ出ないことを確かめる
  for (const walker of WALKERS) {
    for (const foot of getBuildingParts(walker.assetId).filter((part) => part.limb?.kind === "foot")) {
      // 付け根から足底までの高さ
      const toBottom = foot.limb.pivotY - (foot.position.y - foot.height / 2);

      for (let step = 0; step <= 200; step += 1) {
        const walkPhase = (WALK_CYCLE * step) / 200;
        const angle = Math.abs(getLimbSwing(walkPhase, "foot", Math.sign(foot.position.x)));
        // 回したときに一番下へ来る角の、付け根からの深さ
        const lowest = toBottom * Math.cos(angle) + (foot.depth / 2) * Math.sin(angle);
        const sink = lowest - toBottom;
        // 体の弾みはワールド座標なので、パーツの座標へ直して比べる
        const lift = walker.bodyLift(walkPhase) / walker.scale;
        assert.ok(
          sink <= lift + EPSILON,
          `${walker.name} walkPhase=${walkPhase} sink=${sink} lift=${lift}`,
        );
      }
    }
  }
});
