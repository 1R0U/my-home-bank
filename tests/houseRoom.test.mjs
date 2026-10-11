// 自分の家の中の部屋の中身と、キャラクターが歩き回る動き（Issue #386）のテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_X_RANGE,
  clampCharacterX,
  findHouseFurniture,
  findNearbyFurniture,
  getArrivalX,
  getEntranceX,
  getFurnitureButton,
  getFurnitureStandX,
  HOUSE_FLOORS,
  HOUSE_ROOMS,
  NEARBY_RANGE,
  pickWanderPauseMs,
  pickWanderTarget,
  ROOM_WIDTH,
  STICK_SPEED_PER_MS,
  stepByStick,
  stepTowardX,
  toRoomWorldX,
  WALK_SPEED_PER_MS,
  WANDER_PAUSE_MS,
  WANDER_STEP,
} from "../lib/rpg-hub/houseRoom.ts";
import { createRoomShellParts, HOUSE_FURNITURE_SHAPES } from "../lib/rpg-hub/houseRoomParts.ts";

/** 決めた順に値を返す乱数の代わり */
const sequence = (...values) => {
  let index = 0;
  return () => values[index++ % values.length];
};

test("うろうろの行き先は、いつも歩ける範囲の中で、決めた距離だけ離れている", () => {
  for (let x = 0; x <= 1; x += 0.05) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const from = clampCharacterX(x);
      const to = pickWanderTarget(x, sequence(r, r));
      assert.ok(to >= CHARACTER_X_RANGE.min && to <= CHARACTER_X_RANGE.max, `範囲外: ${x} → ${to}`);
      assert.notEqual(to, from, `動いていない: ${x}`);
      assert.ok(Math.abs(to - from) <= WANDER_STEP.max + 1e-9, `歩きすぎ: ${x} → ${to}`);
    }
  }
});

test("壁際では、壁へ向かう目が出ても反対へ歩く", () => {
  // 1つ目の乱数は距離、2つ目は向き（0.5 未満なら右）
  const atRightWall = pickWanderTarget(CHARACTER_X_RANGE.max, sequence(0, 0));
  assert.ok(atRightWall < CHARACTER_X_RANGE.max);
  const atLeftWall = pickWanderTarget(CHARACTER_X_RANGE.min, sequence(0, 0.9));
  assert.ok(atLeftWall > CHARACTER_X_RANGE.min);
});

test("立ち止まる時間は決めた範囲に収まる", () => {
  assert.equal(pickWanderPauseMs(() => 0), WANDER_PAUSE_MS.min);
  assert.ok(pickWanderPauseMs(() => 0.999) <= WANDER_PAUSE_MS.max);
});

test("歩くと決まった速さで行き先へ近づき、行き過ぎずに行き先で止まる", () => {
  const step = stepTowardX(0.2, 0.8, 100);
  assert.equal(step.arrived, false);
  assert.ok(Math.abs(step.x - (0.2 + WALK_SPEED_PER_MS * 100)) < 1e-12);

  const back = stepTowardX(0.8, 0.2, 100);
  assert.ok(back.x < 0.8);

  // 残りが1歩より短ければ、行き先ちょうどで着く
  assert.deepEqual(stepTowardX(0.5, 0.5001, 100), { arrived: true, x: 0.5001 });
  assert.deepEqual(stepTowardX(0.5, 0.5, 0), { arrived: true, x: 0.5 });
});

test("割合の位置は、部屋の中央を 0 とした3Dの横の座標になる", () => {
  assert.equal(toRoomWorldX(0.5), 0);
  assert.equal(toRoomWorldX(0), -ROOM_WIDTH / 2);
  assert.equal(toRoomWorldX(1), ROOM_WIDTH / 2);
});

test("家具の前に立つ位置は、歩ける範囲の中", () => {
  for (const floor of HOUSE_FLOORS) {
    for (const furniture of HOUSE_ROOMS[floor].furniture) {
      const x = getFurnitureStandX(furniture);
      assert.ok(x >= CHARACTER_X_RANGE.min && x <= CHARACTER_X_RANGE.max, furniture.id);
    }
  }
});

test("家具は部屋の壁からはみ出さず、床の上の家具どうしも重ならない", () => {
  // 家具の横幅は、形のパーツのいちばん外側から測る（箱の width、円柱などの直径）。
  // 傾けた箱（階段の手すり）は、傾けたあとの横の広がりで測る
  const halfWidthOf = (kind) =>
    Math.max(
      ...HOUSE_FURNITURE_SHAPES[kind].parts.map((part) => {
        if (part.shape === "box") {
          const angle = part.rotation?.z ?? 0;
          const half = Math.abs((part.width / 2) * Math.cos(angle)) + Math.abs((part.height / 2) * Math.sin(angle));
          return Math.abs(part.position.x) + half;
        }
        const size =
          part.shape === "sphere"
            ? part.diameterX
            : part.shape === "cylinder"
              ? Math.max(part.diameterTop, part.diameterBottom)
              : part.diameter;
        return Math.abs(part.position.x) + size / 2;
      }),
    );
  for (const floor of HOUSE_FLOORS) {
    const spans = HOUSE_ROOMS[floor].furniture.map((furniture) => {
      const center = toRoomWorldX(furniture.x);
      const half = halfWidthOf(furniture.kind);
      assert.ok(center - half >= -ROOM_WIDTH / 2 && center + half <= ROOM_WIDTH / 2, `${floor} の ${furniture.id} が壁からはみ出す`);
      return { furniture, max: center + half, min: center - half };
    });
    const onFloor = spans.filter((span) => !HOUSE_FURNITURE_SHAPES[span.furniture.kind].onWall);
    for (let i = 0; i < onFloor.length; i++) {
      for (let j = i + 1; j < onFloor.length; j++) {
        const a = onFloor[i];
        const b = onFloor[j];
        assert.ok(a.max <= b.min || b.max <= a.min, `${floor} の ${a.furniture.id} と ${b.furniture.id} が重なる`);
      }
    }
  }
});

test("1階には外へ出る扉・クローゼット・上りの階段があり、2階には下りの階段がある", () => {
  const actions = (floor) => HOUSE_ROOMS[floor].furniture.map((item) => item.action);
  assert.ok(actions("ground").includes("exit"));
  assert.ok(actions("ground").includes("wardrobe"));
  assert.ok(actions("ground").includes("upstairs"));
  assert.ok(actions("upstairs").includes("downstairs"));
  // 2階から直接は外へ出られない
  assert.ok(!actions("upstairs").includes("exit"));
});

test("機能のある家具には名札があり、ひとこと話すだけの家具にはせりふがある", () => {
  for (const floor of HOUSE_FLOORS) {
    for (const furniture of HOUSE_ROOMS[floor].furniture) {
      if (furniture.action === "react") assert.ok(furniture.reaction, `${furniture.id} にせりふがない`);
      else assert.ok(furniture.tag, `${furniture.id} に名札がない`);
    }
  }
});

test("同じ階に同じIDの家具は置かない（タップした家具を取り違えないように）", () => {
  for (const floor of HOUSE_FLOORS) {
    const ids = HOUSE_ROOMS[floor].furniture.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, floor);
  }
});

test("家具はIDで引ける。別の階の家具や無いIDは引けない", () => {
  assert.equal(findHouseFurniture("ground", "closet")?.action, "wardrobe");
  assert.equal(findHouseFurniture("upstairs", "closet"), undefined);
  assert.equal(findHouseFurniture("ground", "nothing"), undefined);
});

test("階段で着いたら、もう一方の階へ戻る階段の前に立つ", () => {
  const stairsX = (floor, action) =>
    getFurnitureStandX(HOUSE_ROOMS[floor].furniture.find((item) => item.action === action));
  assert.equal(getArrivalX("upstairs"), stairsX("upstairs", "downstairs"));
  assert.equal(getArrivalX("ground"), stairsX("ground", "upstairs"));
});

test("町から入ってきたら、玄関の扉の前に立つ", () => {
  const door = HOUSE_ROOMS.ground.furniture.find((item) => item.action === "exit");
  assert.equal(getEntranceX(), getFurnitureStandX(door));
});

test("部屋の箱は、どちらの階も作れる", () => {
  for (const floor of HOUSE_FLOORS) {
    assert.ok(createRoomShellParts(floor).length > 0);
  }
});

test("スティックを倒しきると、うろうろより速く歩き、半分なら半分の速さになる", () => {
  assert.ok(STICK_SPEED_PER_MS > WALK_SPEED_PER_MS);
  assert.equal(stepByStick(0.5, 1, 100), 0.5 + STICK_SPEED_PER_MS * 100);
  assert.equal(stepByStick(0.5, -0.5, 100), 0.5 - STICK_SPEED_PER_MS * 50);
  // 倒し具合が範囲を超えて届いても、倒しきったときより速くは歩かない
  assert.equal(stepByStick(0.5, 3, 100), 0.5 + STICK_SPEED_PER_MS * 100);
  assert.equal(stepByStick(0.5, 0, 100), 0.5);
});

test("スティックで歩いても、壁にめり込まない", () => {
  assert.equal(stepByStick(CHARACTER_X_RANGE.max, 1, 1000), CHARACTER_X_RANGE.max);
  assert.equal(stepByStick(CHARACTER_X_RANGE.min, -1, 1000), CHARACTER_X_RANGE.min);
});

test("家具の前に立つと、その家具が使える。少し離れると使えない", () => {
  const closet = findHouseFurniture("ground", "closet");
  assert.equal(findNearbyFurniture("ground", getFurnitureStandX(closet))?.id, "closet");
  assert.equal(findNearbyFurniture("ground", getFurnitureStandX(closet) + NEARBY_RANGE)?.id, "closet");
  assert.equal(findNearbyFurniture("ground", getFurnitureStandX(closet) + NEARBY_RANGE + 0.01), undefined);
});

test("町から入ってきた位置と、階段で着いた位置では、出口・戻りの階段がすぐ使える", () => {
  assert.equal(findNearbyFurniture("ground", getEntranceX())?.action, "exit");
  assert.equal(findNearbyFurniture("upstairs", getArrivalX("upstairs"))?.action, "downstairs");
  assert.equal(findNearbyFurniture("ground", getArrivalX("ground"))?.action, "upstairs");
});

test("近くに家具が2つあるときは、近いほうを使う", () => {
  // 2階の窓（0.55）と本棚（0.62）の間
  assert.equal(findNearbyFurniture("upstairs", 0.57)?.id, "window");
  assert.equal(findNearbyFurniture("upstairs", 0.6)?.id, "bookshelf");
});

test("どの家具の前に立っても、隣の家具と取り違えない（家具どうしは近づいたとみなす距離より離れている）", () => {
  for (const floor of HOUSE_FLOORS) {
    for (const furniture of HOUSE_ROOMS[floor].furniture) {
      const nearby = findNearbyFurniture(floor, getFurnitureStandX(furniture));
      // 窓とソファのように同じ位置に置いた家具は、どちらか一方になる
      assert.equal(nearby && getFurnitureStandX(nearby), getFurnitureStandX(furniture), `${floor} ${furniture.id}`);
    }
  }
});

test("近づいたときのボタンは、家具ですることが分かる文言になる", () => {
  assert.deepEqual(getFurnitureButton(findHouseFurniture("ground", "door")), { emoji: "🚪", label: "そとへ でる" });
  assert.deepEqual(getFurnitureButton(findHouseFurniture("ground", "closet")), { emoji: "👗", label: "きがえる" });
  assert.deepEqual(getFurnitureButton(findHouseFurniture("ground", "stairs-up")), { emoji: "🪜", label: "2かいへ いく" });
  assert.deepEqual(getFurnitureButton(findHouseFurniture("upstairs", "stairs-down")), { emoji: "🪜", label: "1かいへ いく" });
  assert.deepEqual(getFurnitureButton(findHouseFurniture("ground", "sofa")), { emoji: "🔍", label: "ソファを しらべる" });
});
