import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { PLAYER_COLLISION_RADIUS } from "../lib/rpg-hub/movement.ts";
import {
  createNpcWanderState,
  getNpcBodyLift,
  NPC_BOB_HEIGHT,
  settleNpcWalk,
  stepNpcWander,
  WANDER_RADIUS,
} from "../lib/rpg-hub/npcWander.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";

/** 歩き回る対象のNPC。原点に立たせる。 */
const npc = {
  collidable: true,
  collisionSize: { depth: 0.7, width: 0.7 },
  dialogueId: "villager-guide",
  id: "npc-test",
  interactionRadius: 2.2,
  interactive: true,
  model: RPG_HUB_ASSETS.villager,
  name: "テスト住人",
  position: { x: 0, y: 0.66, z: 0 },
  rotationY: 0.5,
  type: "npc",
};

/**
 * 決まった値を順に返す乱数。テストで行き先を固定するために使う。
 * 値を使い切ったら先頭へ戻る。
 */
const fixedRandom = (...values) => {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
};

/** 経過時間を刻みながら、指定回数だけ歩行を進める。 */
const run = (state, steps, objects, random, stepMs = 16) => {
  let current = state;
  for (let i = 0; i < steps; i += 1) {
    current = stepNpcWander(current, stepMs, objects, random);
  }
  return current;
};

/** 家からの距離。 */
const distanceFromHome = (state) =>
  Math.hypot(state.position.x - state.home.x, state.position.z - state.home.z);

// --- 待機と歩き出し ---

test("作った直後は立ち止まっていて、位置が変わらない", () => {
  const state = createNpcWanderState(npc, fixedRandom(0.5));

  const next = stepNpcWander(state, 16, [npc], fixedRandom(0.5));

  assert.deepEqual(next.position, { x: 0, z: 0 });
  assert.ok(next.waitMs > 0, "まだ待機しているはず");
});

test("待機が終わると目的地を決めて歩き出す", () => {
  const state = createNpcWanderState(npc, fixedRandom(0));
  // 待機は最短でも1000ms。それを超えるまで進める
  const walking = run(state, 80, [npc], fixedRandom(0.25, 0.5));

  assert.equal(walking.waitMs, 0);
  assert.ok(walking.target, "目的地が決まっているはず");
  assert.ok(distanceFromHome(walking) > 0, "歩き出しているはず");
});

test("止まっている間に、向きが元へ戻る", () => {
  // 歩いて向きが変わった状態から、待機に入ると restRotationY へ戻る
  const state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    rotationY: Math.PI,
    waitMs: 2000,
  };

  const next = run(state, 100, [npc], fixedRandom(0.5));

  assert.ok(
    Math.abs(next.rotationY - npc.rotationY) < 1e-9,
    `元の向き(${npc.rotationY})へ戻っていない: ${next.rotationY}`,
  );
});

// --- 自分自身との当たり判定 ---

test("自分の当たり判定に阻まれず歩ける", () => {
  // objects に本人が含まれる。ignoreId で外さないと一歩も動けない
  const state = { ...createNpcWanderState(npc, fixedRandom(0)), waitMs: 0 };

  const walked = run(state, 60, [npc], fixedRandom(0.25, 0.9));

  assert.ok(
    distanceFromHome(walked) > 0.1,
    `動けていない（自分の当たり判定に阻まれている可能性）: ${JSON.stringify(walked.position)}`,
  );
});

// --- 範囲 ---

test("家から決めた範囲を大きく超えて遠くへ行かない", () => {
  const random = fixedRandom(0.13, 0.87, 0.41, 0.02, 0.66, 0.29, 0.95, 0.53);
  let state = { ...createNpcWanderState(npc, random), waitMs: 0 };

  // X軸・Z軸を別々に判定する都合で、1歩ぶんだけ円からはみ出しうる
  const limit = WANDER_RADIUS + 0.2;
  for (let i = 0; i < 4000; i += 1) {
    state = stepNpcWander(state, 16, [npc], random);
    assert.ok(
      distanceFromHome(state) <= limit,
      `${i}回目に家から離れすぎた: ${distanceFromHome(state).toFixed(2)}`,
    );
  }
});

// --- 障害物 ---

test("障害物の中へ入らない", () => {
  // 家のすぐ隣に壁を置き、そちらへ向かわせ続ける
  const wall = {
    collidable: true,
    collisionSize: { depth: 6, width: 1 },
    id: "wall",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    position: { x: 1.5, y: 0.25, z: 0 },
    type: "decoration",
  };
  const objects = [npc, wall];
  const random = fixedRandom(0.25, 0.9);
  let state = { ...createNpcWanderState(npc, random), waitMs: 0 };

  const boundary = wall.position.x - wall.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;
  for (let i = 0; i < 2000; i += 1) {
    state = stepNpcWander(state, 16, objects, random);
    assert.ok(
      state.position.x <= boundary + 1e-9,
      `${i}回目に壁へ入り込んだ: x=${state.position.x}`,
    );
  }
});

test("進めなくなったら立ち止まり、目的地を決め直す", () => {
  // 壁にぴったり寄せ、その先を目的地にする。壁へ向かって押し続けないことを確かめる
  const wall = {
    collidable: true,
    collisionSize: { depth: 8, width: 1 },
    id: "wall",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    position: { x: 1.5, y: 0.25, z: 0 },
    type: "decoration",
  };
  const boundary = wall.position.x - wall.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;
  const state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    position: { x: boundary, z: 0 },
    target: { x: 10, z: 0 },
    waitMs: 0,
  };

  const next = stepNpcWander(state, 16, [npc, wall], fixedRandom(0.5));

  assert.deepEqual(next.position, { x: boundary, z: 0 }, "壁へ入り込んでいる");
  assert.equal(next.target, null, "目的地を捨てているはず");
  assert.ok(next.waitMs > 0, "立ち止まっているはず");
});

// --- 目的地への到着 ---

test("目的地に着いたら、また立ち止まる", () => {
  const state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    target: { x: 0.05, z: 0 },
    waitMs: 0,
  };

  const next = stepNpcWander(state, 16, [npc], fixedRandom(0.5));

  assert.equal(next.target, null);
  assert.ok(next.waitMs > 0);
});

// --- 向き ---

test("歩いている向きへ、少しずつ向きを変える", () => {
  // +X 方向へ歩かせる。右手系では正面(+Z)を回すので atan2(dx, dz)
  let state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    target: { x: 2, z: 0 },
    waitMs: 0,
  };

  // 1フレームでは向ききらない（急に向きが変わると体が飛ぶように見えるため）
  const oneFrame = stepNpcWander(state, 16, [npc], fixedRandom(0.5));
  assert.ok(
    Math.abs(oneFrame.rotationY - Math.PI / 2) > 1e-6,
    `1フレームで向ききっている: ${oneFrame.rotationY}`,
  );

  for (let index = 0; index < 60; index += 1) {
    state = stepNpcWander({ ...state, target: { x: 2, z: 0 }, waitMs: 0 }, 16, [npc], fixedRandom(0.5));
  }
  assert.ok(
    Math.abs(state.rotationY - Math.PI / 2) < 1e-9,
    `+X を向いていない: ${state.rotationY}`,
  );
});

test("片方の軸がふさがれても、向きが急に変わらない", () => {
  // +X の壁に沿って +Z へ滑る場面。動いた向き（+Z）で入れ直すと体が横へ飛ぶので、
  // 目的地の向き（斜め）へ少しずつ回すだけにする（Issue #214）
  const wall = {
    collidable: true,
    collisionSize: { depth: 8, width: 1 },
    id: "wall",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    position: { x: 1.5, y: 0.25, z: 0 },
    type: "decoration",
  };
  const boundary = wall.position.x - wall.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;
  const state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    position: { x: boundary, z: 0 },
    // 壁の向こう斜め前。X は進めず、Z だけ進む
    target: { x: 10, z: 10 },
    waitMs: 0,
  };

  const next = stepNpcWander(state, 16, [npc, wall], fixedRandom(0.5));

  assert.equal(next.position.x, boundary, "壁へ入り込んでいる");
  assert.ok(next.position.z > 0, "Z方向へ滑っていない");
  // 1フレームで回れるのは 0.009 * 16 = 0.144 ラジアンまで
  assert.ok(
    Math.abs(next.rotationY - state.rotationY) <= 0.009 * 16 + 1e-9,
    `1フレームで向きが飛んでいる: ${state.rotationY} -> ${next.rotationY}`,
  );
});

test("小突かれて一歩も進めなくても、向きは変わらない", () => {
  // プレイヤーが正面から当たって進めなくなった場面。立ち止まって次の目的地を決めるが、
  // **その瞬間に向きを変えない**（小突くたびに体が回るとキャラクターに見えない）
  const blocker = {
    collidable: true,
    collisionSize: { depth: 1, width: 1 },
    id: "blocker",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    // 当たり判定の縁（0.5 + PLAYER_COLLISION_RADIUS）のすぐ外に立てる。
    // 一歩でも前へ出ると、もう入れない位置
    position: { x: 0, y: 0.25, z: 0.5 + PLAYER_COLLISION_RADIUS + 0.01 },
    type: "decoration",
  };
  const state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    position: { x: 0, z: 0 },
    rotationY: 0.5,
    target: { x: 0, z: 3 },
    waitMs: 0,
  };

  const next = stepNpcWander(state, 16, [npc, blocker], fixedRandom(0.5));

  assert.deepEqual(next.position, state.position, "動けてしまっている");
  assert.equal(next.rotationY, state.rotationY, "小突かれて向きが変わった");
});

// --- 歩く動作（Issue #377） ---

test("作った直後は手足をそろえて立っている", () => {
  const state = createNpcWanderState(npc, fixedRandom(0.5));

  assert.equal(state.walkPhase, 0);
  assert.equal(getNpcBodyLift(state, 1), 0);
});

test("歩いている間は、手足を振る位相が進み、体が弾む", () => {
  let state = { ...createNpcWanderState(npc, fixedRandom(0)), target: { x: 10, z: 0 }, waitMs: 0 };
  let highest = 0;

  for (let index = 0; index < 60; index += 1) {
    state = stepNpcWander(state, 16, [npc], fixedRandom(0.5));
    const lift = getNpcBodyLift(state, 1);
    assert.ok(lift >= 0 && lift <= NPC_BOB_HEIGHT, `lift=${lift}`);
    highest = Math.max(highest, lift);
  }

  assert.ok(highest > NPC_BOB_HEIGHT * 0.9, `弾んでいない highest=${highest}`);
});

test("立ち止まっている間は、手足を振り始めない", () => {
  let state = createNpcWanderState(npc, fixedRandom(0.5));

  for (let index = 0; index < 30; index += 1) {
    state = stepNpcWander(state, 16, [npc], fixedRandom(0.5));
    assert.equal(state.walkPhase, 0);
  }
});

test("目的地に着いたら、踏み出しかけた1歩を終えて手足をそろえる", () => {
  // 1歩目の途中で、目的地のすぐそばにいる
  let state = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    target: { x: 0.05, z: 0 },
    waitMs: 0,
    walkPhase: Math.PI * 0.4,
  };

  for (let index = 0; index < 100; index += 1) {
    state = stepNpcWander(state, 16, [npc], fixedRandom(0.5));
  }

  assert.equal(state.walkPhase, Math.PI);
});

test("進めないフレームでは、手足を振り続けない", () => {
  // 壁にぴったり寄せ、その先を目的地にする（「進めなくなったら立ち止まり」と同じ置き方）。
  // 足踏みしたまま壁を押しているように見えないよう、手足はそろえて止める
  const wall = {
    collidable: true,
    collisionSize: { depth: 8, width: 1 },
    id: "wall",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    position: { x: 1.5, y: 0.25, z: 0 },
    type: "decoration",
  };
  const boundary = wall.position.x - wall.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;
  const blocked = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    position: { x: boundary, z: 0 },
    target: { x: 10, z: 0 },
    waitMs: 0,
    walkPhase: Math.PI * 1.2,
  };

  const next = stepNpcWander(blocked, 16, [npc, wall], fixedRandom(0.5));

  assert.deepEqual(next.position, blocked.position, "前提: 進めていない");
  // 進めなかったフレームでも、振りかけた手足は1歩の終わりへ向けて進める（戻さない）
  assert.ok(next.walkPhase > blocked.walkPhase, `walkPhase=${next.walkPhase}`);

  let state = next;
  for (let index = 0; index < 100; index += 1) {
    state = stepNpcWander(state, 16, [npc, wall], fixedRandom(0.99));
  }
  assert.equal(state.walkPhase, 0, "手足がそろっていない");
});

test("会話中などで止めたときは、位置を変えずに手足だけをそろえる", () => {
  const walking = {
    ...createNpcWanderState(npc, fixedRandom(0)),
    target: { x: 10, z: 0 },
    waitMs: 0,
    walkPhase: Math.PI * 0.4,
  };
  let state = walking;

  for (let index = 0; index < 100; index += 1) {
    state = settleNpcWalk(state, 16);
  }

  assert.equal(state.walkPhase, Math.PI);
  assert.deepEqual(state.position, walking.position);
  assert.equal(state.rotationY, walking.rotationY);
  assert.deepEqual(state.target, walking.target);
});

test("手足がそろっていれば、止めても同じ状態をそのまま返す（作り直さない）", () => {
  const state = createNpcWanderState(npc, fixedRandom(0.5));

  assert.equal(settleNpcWalk(state, 16), state);
});

// --- 再現性 ---

test("同じ乱数を渡せば、同じ動きになる", () => {
  const seed = [0.31, 0.72, 0.18, 0.94, 0.55];
  const first = run({ ...createNpcWanderState(npc, fixedRandom(...seed)), waitMs: 0 }, 300, [npc], fixedRandom(...seed));
  const second = run({ ...createNpcWanderState(npc, fixedRandom(...seed)), waitMs: 0 }, 300, [npc], fixedRandom(...seed));

  assert.deepEqual(first, second);
});

test("元の状態を書き換えない", () => {
  const state = { ...createNpcWanderState(npc, fixedRandom(0)), waitMs: 0 };
  const snapshot = JSON.parse(JSON.stringify(state));

  stepNpcWander(state, 16, [npc], fixedRandom(0.5));

  assert.deepEqual(state, snapshot);
});

test("大きな経過時間でも一度に飛ばない", () => {
  // 画面復帰などで deltaMs が跳ねても、壁を抜けないよう上限で刻む
  const state = { ...createNpcWanderState(npc, fixedRandom(0)), target: { x: 10, z: 0 }, waitMs: 0 };

  const next = stepNpcWander(state, 10000, [npc], fixedRandom(0.5));

  assert.ok(next.position.x < 0.2, `一度に進みすぎ: ${next.position.x}`);
});

// --- 初期マップでの動作 ---

test("初期マップのNPCを歩かせても、障害物の中へ入らない", () => {
  const objects = INITIAL_MAP_OBJECTS.map((object) => ({
    ...object,
    position: { ...object.position },
  }));
  const npcs = objects.filter((object) => object.type === "npc");
  assert.ok(npcs.length > 0, "NPCがいない");

  const random = fixedRandom(0.07, 0.61, 0.38, 0.92, 0.24, 0.5);
  let states = npcs.map((object) => ({ ...createNpcWanderState(object, random), waitMs: 0 }));

  /** その座標が障害物に重なっているか（本人は除く）。 */
  const isInside = (point, selfId) =>
    objects.some((object) => {
      if (object.id === selfId) return false;
      if (!object.collidable || !object.collisionSize) return false;
      const scale = object.scale ?? 1;
      return (
        Math.abs(point.x - object.position.x) <
          (object.collisionSize.width * scale) / 2 + PLAYER_COLLISION_RADIUS &&
        Math.abs(point.z - object.position.z) <
          (object.collisionSize.depth * scale) / 2 + PLAYER_COLLISION_RADIUS
      );
    });

  for (let i = 0; i < 1500; i += 1) {
    states = states.map((state) => {
      const next = stepNpcWander(state, 16, objects, random);
      // シーンと同じく、動いた結果をマップデータへ書き戻す
      const object = objects.find((candidate) => candidate.id === state.id);
      object.position.x = next.position.x;
      object.position.z = next.position.z;
      return next;
    });

    for (const state of states) {
      assert.ok(
        !isInside(state.position, state.id),
        `${state.id} が ${i}回目に障害物へ入り込んだ: ${JSON.stringify(state.position)}`,
      );
    }
  }
});
