import assert from "node:assert/strict";
import test from "node:test";
import { NO_SHADOW_ASSETS, RPG_HUB_ASSETS, resolveAssetId } from "../lib/rpg-hub/assets.ts";
import {
  HOUSE_INTERIOR_ENTRY,
  INITIAL_MAP_OBJECTS,
  parseMapObject,
  parseMapObjects,
} from "../lib/rpg-hub/mapObjects.ts";
import {
  findNearbyInteractiveId,
  getBuildingExitPoint,
  getJoystickMovement,
  getLocalTouchPosition,
  isBlocked,
  moveWithinMap,
  overlapsObject,
  PLAYER_COLLISION_RADIUS,
} from "../lib/rpg-hub/movement.ts";
import { getDialogue } from "../lib/rpg-hub/dialogues.ts";
import { getSeason } from "../lib/rpg-hub/season.ts";
import { resolveMapRoute } from "../lib/rpg-hub/routes.ts";

const validBuilding = {
  collidable: true,
  collisionSize: { depth: 2, width: 3 },
  entranceOffset: { x: 0, y: 0, z: 1 },
  id: "bank",
  interactionRadius: 3,
  interactive: true,
  model: RPG_HUB_ASSETS.bank,
  position: { x: 0, y: 1, z: 2 },
  route: "bank",
  type: "building",
};

/** 当たり判定を持つ装飾物（幹の太さに合わせた小さめの判定） */
const validTree = {
  collidable: true,
  collisionSize: { depth: 0.6, width: 0.6 },
  id: "tree",
  interactive: false,
  model: RPG_HUB_ASSETS.tree,
  position: { x: 2, y: 0.8, z: 0 },
  type: "decoration",
};

/** 接近判定と検証に使うNPC */
const validNpc = {
  collidable: true,
  collisionSize: { depth: 0.7, width: 0.7 },
  dialogueId: "villager-guide",
  id: "npc-test",
  interactionRadius: 2.2,
  interactive: true,
  model: RPG_HUB_ASSETS.villager,
  name: "あんない人",
  palette: { accent: "#2f855a", hair: "#3f2a1d", skin: "#f3c9a4" },
  position: { x: 0, y: 0.66, z: 0 },
  type: "npc",
};

test("許可された建物データをパースできる", () => {
  const result = parseMapObject(validBuilding);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.object.type, "building");
});

test("履歴建物のアセットと画面遷移先を解決できる", () => {
  const result = parseMapObject({
    ...validBuilding,
    id: "history",
    model: RPG_HUB_ASSETS.history,
    route: "history",
  });

  assert.equal(result.success, true);
  assert.equal(resolveMapRoute("history", "child"), "/history");
});

test("姿見（家の中）のアセットと画面遷移先を解決できる", () => {
  const result = parseMapObject({
    ...validBuilding,
    id: "wardrobe",
    model: RPG_HUB_ASSETS.wardrobe,
    route: "wardrobe",
  });

  assert.equal(result.success, true);
  assert.equal(resolveMapRoute("wardrobe", "child"), "/wardrobe");
  assert.equal(resolveMapRoute("wardrobe", "parent"), "/wardrobe");
});

test("自分の家のアセットとルートIDを解決できる", () => {
  const result = parseMapObject({
    ...validBuilding,
    id: "house",
    model: RPG_HUB_ASSETS.house,
    route: "house",
  });

  assert.equal(result.success, true);
});

test("家の中へ入ったときの立ち位置は何にも重なっていない", () => {
  // テレポート先なので、他の建物のように getBuildingExitPoint で毎回求め直さない。
  // 座標がずれると、入った瞬間に動けなくなる
  assert.equal(isBlocked(HOUSE_INTERIOR_ENTRY.x, HOUSE_INTERIOR_ENTRY.z, INITIAL_MAP_OBJECTS), false);
});

test("家の中の更衣室（奥の部屋の左端）まで進むと姿見に近づける", () => {
  // 入口（玄関）は姿見のある更衣室とは別の部屋なので、入った直後は近づけない。
  // 通り道を抜けて更衣室に入ると近づけることを確かめる
  assert.equal(findNearbyInteractiveId(HOUSE_INTERIOR_ENTRY, INITIAL_MAP_OBJECTS), null);
  assert.equal(
    findNearbyInteractiveId({ x: -4.2, z: -60 }, INITIAL_MAP_OBJECTS),
    "house-mirror",
  );
});

test("増築した部屋の階段から2階へ、2階の階段から1階へ行ける", () => {
  assert.equal(findNearbyInteractiveId({ x: 9, z: -60 }, INITIAL_MAP_OBJECTS), "house-stairs-up");
  assert.equal(findNearbyInteractiveId({ x: 0, z: -140 }, INITIAL_MAP_OBJECTS), "house-stairs-down");
});

test("未知のアセット・ルート・不正な数値を拒否する", () => {
  const result = parseMapObject({
    ...validBuilding,
    interactionRadius: -1,
    model: "https://example.com/evil.glb",
    position: { x: Number.NaN, y: 0, z: 0 },
    route: "/unknown",
  });
  assert.equal(result.success, false);
});

test("entranceOffsetが不正な建物は拒否する", () => {
  assert.equal(
    parseMapObject({ ...validBuilding, entranceOffset: { x: 0, y: 0, z: Number.NaN } }).success,
    false,
  );
  assert.equal(parseMapObject({ ...validBuilding, entranceOffset: undefined }).success, false);
});

test("collidableはbooleanだけを受け入れる", () => {
  assert.equal(parseMapObject({ ...validBuilding, collidable: true }).success, true);
  assert.equal(parseMapObject({ ...validBuilding, collidable: false }).success, true);
  assert.equal(parseMapObject({ ...validBuilding, collidable: "true" }).success, false);
});

test("装飾をインタラクティブにはできない", () => {
  const result = parseMapObject({
    ...validBuilding,
    interactive: true,
    model: RPG_HUB_ASSETS.tree,
    type: "decoration",
  });
  assert.equal(result.success, false);
});

test("装飾物にも衝突判定の大きさを持たせられる", () => {
  const result = parseMapObject(validTree);

  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.object.collisionSize, { depth: 0.6, width: 0.6 });
});

test("collidable: trueなのにcollisionSizeがない装飾物は拒否する", () => {
  // 大きさがないと衝突判定から静かに外れ、すり抜けられる状態に戻ってしまう
  const { collisionSize, ...withoutSize } = validTree;

  assert.equal(parseMapObject(withoutSize).success, false);
});

test("collidable: falseの建物でもcollisionSizeは必須", () => {
  // 建物は当たり判定を外しても大きさを持つ前提で型を定義している
  const { collisionSize, ...withoutSize } = validBuilding;

  assert.equal(parseMapObject({ ...withoutSize, collidable: false }).success, false);
});

test("不正なcollisionSizeは種類を問わず拒否する", () => {
  assert.equal(parseMapObject({ ...validTree, collisionSize: { depth: 0, width: 1 } }).success, false);
  assert.equal(parseMapObject({ ...validTree, collisionSize: { width: 1 } }).success, false);
  assert.equal(parseMapObject({ ...validBuilding, collisionSize: { depth: -1, width: 3 } }).success, false);
});

test("初期マップのオブジェクトはすべて検証を通る", () => {
  // 木はヘルパー関数で作っているため、生成した値が検証を通ることを確かめる
  const { errors, objects } = parseMapObjects(INITIAL_MAP_OBJECTS);

  assert.deepEqual(errors, []);
  assert.equal(objects.length, INITIAL_MAP_OBJECTS.length);
});

test("NPCのデータをパースできる", () => {
  const result = parseMapObject(validNpc);

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.object.type, "npc");
    assert.equal(result.object.name, "あんない人");
    assert.deepEqual(result.object.palette, {
      accent: "#2f855a",
      hair: "#3f2a1d",
      skin: "#f3c9a4",
    });
  }
});

test("名前のないNPCは拒否する", () => {
  const { name, ...withoutName } = validNpc;

  assert.equal(parseMapObject(withoutName).success, false);
  assert.equal(parseMapObject({ ...validNpc, name: "   " }).success, false);
});

test("家族との紐づけ（familyMemberId）は任意だが、空文字は拒否する", () => {
  assert.equal(parseMapObject({ ...validNpc, familyMemberId: "user-1" }).success, true);
  assert.equal(parseMapObject({ ...validNpc, familyMemberId: "" }).success, false);
  assert.equal(parseMapObject({ ...validNpc, familyMemberId: 42 }).success, false);
});

test("色の差し替えは、既知の枠と16進カラーコードだけを受け付ける", () => {
  // 描画側へそのまま渡す値なので、形式を絞る
  assert.equal(parseMapObject({ ...validNpc, palette: { accent: "#ff0000" } }).success, true);
  assert.equal(parseMapObject({ ...validNpc, palette: { unknown: "#ff0000" } }).success, false);
  assert.equal(parseMapObject({ ...validNpc, palette: { accent: "red" } }).success, false);
  assert.equal(parseMapObject({ ...validNpc, palette: { accent: "#f00" } }).success, false);
  assert.equal(parseMapObject({ ...validNpc, palette: "#ff0000" }).success, false);
});

test("重複IDをmapStoreへ渡さない", () => {
  const result = parseMapObjects([validBuilding, validBuilding]);
  assert.equal(result.objects.length, 1);
  assert.equal(result.errors.length, 1);
});

test("AssetIdは辞書にある値だけ解決する", () => {
  assert.equal(resolveAssetId(RPG_HUB_ASSETS.player), RPG_HUB_ASSETS.player);
  assert.equal(resolveAssetId("unknown"), null);
});

test("月から季節を判定する", () => {
  assert.equal(getSeason(new Date(2026, 3, 1)), "spring");
  assert.equal(getSeason(new Date(2026, 6, 1)), "summer");
  assert.equal(getSeason(new Date(2026, 9, 1)), "autumn");
  assert.equal(getSeason(new Date(2026, 0, 1)), "winter");
});

/**
 * 目標地点に届くまで少しずつ歩く。障害物で進めなくなったらその場で止める。
 * @returns 止まった位置
 */
function walkTo(from, target, objects) {
  const STEP = 0.2;
  let position = from;

  for (let i = 0; i < 500; i += 1) {
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) break;

    const ratio = Math.min(STEP, distance) / distance;
    const next = moveWithinMap(position, { x: dx * ratio, z: dz * ratio }, objects);
    if (next.x === position.x && next.z === position.z) break;
    position = next;
  }

  return position;
}

test("歩ける範囲に上限はなく、障害物がなければどこまでも進める", () => {
  assert.deepEqual(moveWithinMap({ x: 0, z: 0 }, { x: 8, z: -8 }), { x: 8, z: -8 });
  // 以前は原点から10で頭打ちになっていた
  assert.deepEqual(moveWithinMap({ x: 40, z: -40 }, { x: 20, z: -20 }), { x: 60, z: -60 });
});

test("初期マップの外側でも歩ける", () => {
  // いちばん外の木より遠くへ出ても、止められない
  const result = moveWithinMap({ x: 0, z: 0 }, { x: 0, z: 30 }, INITIAL_MAP_OBJECTS);

  assert.deepEqual(result, { x: 0, z: 30 });
});

test("衝突判定が有効な建物には進入できない", () => {
  // 建物(x=3, width=3)の衝突範囲はプレイヤー半径込みで x: 1.05〜4.95
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 } };

  const result = moveWithinMap({ x: 1, z: 0 }, { x: 0.5, z: 0 }, [building]);

  assert.deepEqual(result, { x: 1, z: 0 });
});

test("衝突する建物があっても、ブロックされない軸方向へは壁沿いに移動できる", () => {
  // z方向の移動先(0.3)は建物の衝突範囲(z: -1.45〜1.45)の内側にとどまるため、
  // x方向がブロックされたままでもz方向へは移動できることを確認する
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 } };

  const result = moveWithinMap({ x: 1, z: 0 }, { x: 0.5, z: 0.3 }, [building]);

  assert.equal(result.x, 1);
  assert.equal(result.z, 0.3);
});

test("移動量が大きくても建物をすり抜けない（トンネリング対策）", () => {
  // 目的地の座標だけを判定すると、x=0→x=6の移動は幅3・中心x=3の建物の
  // 衝突範囲(x: 1.05〜4.95)を横断するが終点は範囲外になるためすり抜けてしまう
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 } };
  const collisionBoundary = building.position.x - building.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;

  const result = moveWithinMap({ x: 0, z: 0 }, { x: 6, z: 0 }, [building]);

  assert.notEqual(result.x, 6);
  assert.ok(result.x <= collisionBoundary + 1e-9);
});

test("collidable: falseの装飾物は移動を妨げない", () => {
  const tree = {
    collidable: false,
    id: "tree",
    interactive: false,
    model: RPG_HUB_ASSETS.tree,
    position: { x: 1, y: 0.8, z: 0 },
    type: "decoration",
  };

  const result = moveWithinMap({ x: 0, z: 0 }, { x: 1, z: 0 }, [tree]);

  assert.deepEqual(result, { x: 1, z: 0 });
});

test("衝突判定が有効な装飾物には進入できない", () => {
  // 木(x=2, width=0.6)の衝突範囲はプレイヤー半径込みで x: 1.25〜2.75
  const boundary = validTree.position.x - validTree.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;

  const result = moveWithinMap({ x: 0, z: 0 }, { x: 2, z: 0 }, [validTree]);

  assert.notEqual(result.x, 2);
  assert.ok(result.x <= boundary + 1e-9);
});

test("装飾物の当たり判定は見た目より小さく、横をすり抜けられる", () => {
  // 木の見た目は直径1.8の円錐だが、当たり判定は幹に合わせた0.6。
  // 中心から0.8ずれた線上（見た目の内側）は通り抜けられる
  const result = moveWithinMap({ x: 0, z: 0.8 }, { x: 4, z: 0 }, [validTree]);

  assert.deepEqual(result, { x: 4, z: 0.8 });
});

test("初期マップの木には正面から進入できない", () => {
  // 木はストアの左手前にある。ストアの衝突範囲に入らない側（-X方向）から近づいて、
  // 木だけの判定であることを確かめる
  const tree = INITIAL_MAP_OBJECTS.find((object) => object.id === "tree-store-front");
  const boundary = tree.position.x
    - (tree.collisionSize.width * (tree.scale ?? 1)) / 2
    - PLAYER_COLLISION_RADIUS;

  const result = moveWithinMap({ x: 0, z: tree.position.z }, { x: 3, z: 0 }, INITIAL_MAP_OBJECTS);

  assert.notEqual(result.x, 3);
  assert.ok(result.x <= boundary + 1e-9, `${result.x} が ${boundary} を超えている`);
});

test("建物のscaleを当たり判定の大きさに反映する", () => {
  // 幅3の建物をscale 2にすると、衝突範囲はプレイヤー半径込みで x: -0.45〜6.45。
  // scaleを掛けないと x: 1.05〜 なので、目的地の x=0 まで進めてしまう
  const building = { ...validBuilding, position: { x: 3, y: 1, z: 0 }, scale: 2 };
  const boundary = building.position.x
    - (building.collisionSize.width * building.scale) / 2
    - PLAYER_COLLISION_RADIUS;

  const result = moveWithinMap({ x: -1, z: 0 }, { x: 1, z: 0 }, [building]);

  assert.notEqual(result.x, 0);
  assert.ok(result.x <= boundary + 1e-9, `${result.x} が ${boundary} を超えている`);
});

test("建物のscaleを入口の位置にも反映する", () => {
  // entranceOffset.z=1 をscale 2で使うと入口は(0, 2)。プレイヤー(0, 4.5)との距離は2.5で
  // interactionRadius(3)の内側。scaleを掛けないと入口は(0, 1)で距離3.5となり範囲外になる
  const building = { ...validBuilding, position: { x: 0, y: 1, z: 0 }, scale: 2 };

  assert.equal(findNearbyInteractiveId({ x: 0, z: 4.5 }, [building]), "bank");
});

// --- 回転を反映した当たり判定（Issue #198） ---

/** 幅3・奥行き2の、回さなければ x: ±1.95 / z: ±1.45 が塞がる建物（プレイヤー半径込み）。 */
const rectBuilding = { ...validBuilding, position: { x: 0, y: 1, z: 0 } };

test("当たり判定を90度回すと、幅と奥行きが入れ替わる", () => {
  // 幅3・奥行き2を90度回すと、塞がる範囲は x: ±1.45 / z: ±1.95 になる
  const rotated = { ...rectBuilding, rotationY: Math.PI / 2 };

  // 回す前は幅の側（X）が塞がっていて、回すと通れる
  assert.equal(overlapsObject(1.7, 0, rectBuilding), true);
  assert.equal(overlapsObject(1.7, 0, rotated), false);
  // 奥行きの側（Z）はその逆
  assert.equal(overlapsObject(0, 1.7, rectBuilding), false);
  assert.equal(overlapsObject(0, 1.7, rotated), true);
});

test("当たり判定を45度回すと、AABBが元の矩形より大きくなる", () => {
  // 回転後の4頂点を囲む矩形なので、斜めにすると両方向へ広がる（半分の大きさは
  // (3 + 2) × cos45° / 2 ≒ 1.77。プレイヤー半径込みで x/z とも ±2.22）
  const rotated = { ...rectBuilding, rotationY: Math.PI / 4 };

  assert.equal(overlapsObject(2.1, 0, rectBuilding), false);
  assert.equal(overlapsObject(2.1, 0, rotated), true);
  assert.equal(overlapsObject(0, 2.1, rectBuilding), false);
  assert.equal(overlapsObject(0, 2.1, rotated), true);
  // 広がっても、元の矩形の内側は当然塞がったまま
  assert.equal(overlapsObject(1, 1, rotated), true);
});

test("rotationYが0や未指定なら、当たり判定は回転前と変わらない", () => {
  const zero = { ...rectBuilding, rotationY: 0 };
  const points = [
    { x: 0, z: 0 },
    { x: 1.9, z: 0 },
    { x: 2, z: 0 },
    { x: 0, z: 1.4 },
    { x: 0, z: 1.5 },
    { x: 1.9, z: 1.4 },
  ];

  for (const point of points) {
    assert.equal(
      overlapsObject(point.x, point.z, zero),
      overlapsObject(point.x, point.z, rectBuilding),
      `(${point.x}, ${point.z}) の判定が rotationY: 0 で変わっている`,
    );
  }
  // 回さない矩形は、これまでどおり幅3・奥行き2のまま（プレイヤー半径込みで x: ±1.95 / z: ±1.45）
  assert.equal(overlapsObject(1.9, 0, rectBuilding), true);
  assert.equal(overlapsObject(2, 0, rectBuilding), false);
  assert.equal(overlapsObject(0, 1.4, rectBuilding), true);
  assert.equal(overlapsObject(0, 1.5, rectBuilding), false);
});

test("正方形の当たり判定は、直角に回しても変わらない", () => {
  // 木のような正方形の判定は、90度単位で回すかぎり元の矩形と同じ
  const points = [
    { x: 1.3, z: 0 },
    { x: 1.2, z: 0 },
    { x: 2, z: 0.7 },
    { x: 2, z: 0.76 },
  ];

  for (const rotationY of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const rotated = { ...validTree, rotationY };
    for (const point of points) {
      assert.equal(
        overlapsObject(point.x, point.z, rotated),
        overlapsObject(point.x, point.z, validTree),
        `(${point.x}, ${point.z}) の判定が rotationY: ${rotationY} で変わっている`,
      );
    }
  }
});

test("正方形の当たり判定も、斜めに回すと4頂点を囲むぶん広がる", () => {
  // 回転を保った矩形（OBB）ではなくAABBなので、斜めにすると角のぶんだけ広がる。
  // 当たり判定が見た目より大きくなるのが気になるようなら、OBBは後続Issueで検討する
  // （docs/RPG_HUB_ARCHITECTURE.md 5.1節）
  const rotated = { ...validTree, rotationY: Math.PI / 4 };
  // 木(x=2, 一辺0.6)の塞ぐ範囲は x: 1.25〜2.75。45度回すと一辺が0.6×√2≒0.85に広がる
  assert.equal(overlapsObject(1.2, 0, validTree), false);
  assert.equal(overlapsObject(1.2, 0, rotated), true);
});

test("回転した障害物には、回転後の当たり判定どおりに止められる", () => {
  // 幅3・奥行き2の建物を90度回すと、X方向に塞がるのは x: ±1.45。
  // 回転を見ないと ±1.95 で止まるので、目的地の x=-1.6 まで進めない
  const rotated = { ...rectBuilding, rotationY: Math.PI / 2 };

  const result = moveWithinMap({ x: -3, z: 0 }, { x: 1.4, z: 0 }, [rotated]);

  assert.equal(result.z, 0);
  assert.ok(result.x >= -1.6 - 1e-9, `回転後の当たり判定より手前で止まっている: x=${result.x}`);
});

test("装飾物と建物が隣接していても、すき間に挟まって動けなくならない", () => {
  // ストア手前の木は、ストアの衝突範囲と重なる位置にある。
  // 斜めに押し込むように歩かせ、どの到達位置でもいずれかの方向へ動けることを確認する。
  const pushes = [
    { x: 0.2, z: 0.2 },
    { x: -0.2, z: 0.2 },
    { x: 0.2, z: -0.2 },
    { x: -0.2, z: -0.2 },
  ];
  const directions = [
    { x: 0.2, z: 0 },
    { x: -0.2, z: 0 },
    { x: 0, z: 0.2 },
    { x: 0, z: -0.2 },
  ];

  for (const push of pushes) {
    let position = { x: 0, z: 0 };
    for (let step = 0; step < 150; step += 1) {
      position = moveWithinMap(position, push, INITIAL_MAP_OBJECTS);
      const canMove = directions.some((direction) => {
        const next = moveWithinMap(position, direction, INITIAL_MAP_OBJECTS);
        return next.x !== position.x || next.z !== position.z;
      });
      assert.ok(canMove, `(${position.x}, ${position.z}) から動けなくなった`);
    }
  }
});

test("出発地点から道なりに歩くと、4つの建物すべてに着く", () => {
  // 道は「工」の形。中央の道で南北の道へ出て、そこから東西に進むと扉の前に着く
  const routes = [
    { id: "tasks-building", waypoints: [{ x: 0, z: -2.6 }, { x: -5.6, z: -2.6 }] },
    { id: "bank-building", waypoints: [{ x: 0, z: -2.6 }, { x: 5.6, z: -2.6 }] },
    { id: "history-building", waypoints: [{ x: 0, z: 8.2 }, { x: -5.6, z: 8.2 }] },
    { id: "store-building", waypoints: [{ x: 0, z: 8.2 }, { x: 5.6, z: 8.2 }] },
  ];

  for (const route of routes) {
    let position = { x: 0, z: 0 };
    for (const waypoint of route.waypoints) {
      position = walkTo(position, waypoint, INITIAL_MAP_OBJECTS);
    }

    assert.equal(
      findNearbyInteractiveId(position, INITIAL_MAP_OBJECTS),
      route.id,
      `${route.id} に着けない（(${position.x}, ${position.z}) で止まった）`,
    );
  }
});

test("道は当たり判定を持たず、端から端まで歩ける", () => {
  // 装飾物を道の上に置いてしまうと、道なりに歩けなくなる
  for (const prefix of ["path-south", "path-north", "path-center"]) {
    const tiles = INITIAL_MAP_OBJECTS
      .filter((object) => object.id.startsWith(`${prefix}-`))
      .map((object) => ({ id: object.id, x: object.position.x, z: object.position.z }));

    assert.ok(tiles.length >= 5, `${prefix} のタイルが見つからない`);
    for (const object of INITIAL_MAP_OBJECTS.filter((o) => o.id.startsWith(`${prefix}-`))) {
      assert.equal(object.collidable, false, `${object.id} が通行の邪魔になっている`);
    }

    let position = { x: tiles[0].x, z: tiles[0].z };
    for (const tile of tiles.slice(1)) {
      position = walkTo(position, tile, INITIAL_MAP_OBJECTS);
      assert.ok(
        Math.hypot(position.x - tile.x, position.z - tile.z) < 0.1,
        `${prefix}: ${tile.id} まで歩けない（(${position.x}, ${position.z}) で止まった）`,
      );
    }
  }
});

test("ジョイスティックのドラッグ方向と強さを移動量へ変換する", () => {
  const right = getJoystickMovement(50, 0, 40, 0.2);
  assert.equal(right.direction, "right");
  assert.equal(right.knobX, 40);
  assert.equal(right.x, 0.2);
  assert.equal(right.z, 0);

  const diagonal = getJoystickMovement(-20, -20, 40, 0.2);
  assert.equal(diagonal.direction, "up");
  assert.ok(diagonal.x < 0);
  assert.ok(diagonal.z < 0);
  assert.ok(Math.hypot(diagonal.knobX, diagonal.knobY) <= 40);
});

test("ジョイスティック中央のデッドゾーンでは移動しない", () => {
  assert.deepEqual(getJoystickMovement(2, 1, 40, 0.2), {
    direction: null,
    knobX: 0,
    knobY: 0,
    x: 0,
    z: 0,
  });
});

test("画面座標を移動パッド内のローカル座標へ変換する", () => {
  assert.deepEqual(getLocalTouchPosition(180, 320, 20, 50), { x: 160, y: 270 });
});

test("入口の接近範囲内に入った建物のidを返す", () => {
  const building = { ...validBuilding, position: { x: 0, y: 1, z: 0 } };
  // entranceOffset.z=1 なので入口は(0,1)。プレイヤーは(0,2)で距離1、interactionRadius(3)内
  const result = findNearbyInteractiveId({ x: 0, z: 2 }, [building]);
  assert.equal(result, "bank");
});

test("接近範囲外の建物は対象にしない", () => {
  const building = { ...validBuilding, position: { x: 0, y: 1, z: 0 } };
  const result = findNearbyInteractiveId({ x: 0, z: 20 }, [building]);
  assert.equal(result, null);
});

test("複数の建物が範囲内にある場合は入口までの距離が最短のものを選ぶ", () => {
  const near = { ...validBuilding, id: "near", position: { x: 1, y: 1, z: 0 } };
  const far = { ...validBuilding, id: "far", position: { x: -2, y: 1, z: 0 } };
  const result = findNearbyInteractiveId({ x: 0, z: 0 }, [far, near]);
  assert.equal(result, "near");
});

test("距離が同じ場合はidの昇順で決定する", () => {
  const b = { ...validBuilding, id: "b", position: { x: 1, y: 1, z: 0 } };
  const a = { ...validBuilding, id: "a", position: { x: -1, y: 1, z: 0 } };
  const result = findNearbyInteractiveId({ x: 0, z: -1 }, [b, a]);
  assert.equal(result, "a");
});

test("装飾物は接近判定の対象にしない", () => {
  // 木や岩は interactive: false。話しかける相手でも入れる場所でもない
  const result = findNearbyInteractiveId({ x: 0, z: 0 }, [{ ...validTree, position: { x: 0, y: 0.8, z: 0 } }]);

  assert.equal(result, null);
});

test("接近範囲内のNPCのidを返す", () => {
  // NPCは入口オフセットを持たず、立ち位置そのものが基準になる
  const result = findNearbyInteractiveId({ x: 0, z: 1.5 }, [validNpc]);

  assert.equal(result, "npc-test");
});

test("接近範囲外のNPCは対象にしない", () => {
  // interactionRadius は2.2。距離2.5は範囲外
  assert.equal(findNearbyInteractiveId({ x: 0, z: 2.5 }, [validNpc]), null);
});

test("接近範囲のちょうど境界にいるNPCは対象に含める", () => {
  const radius = validNpc.interactionRadius;

  assert.equal(findNearbyInteractiveId({ x: 0, z: radius }, [validNpc]), "npc-test");
  assert.equal(findNearbyInteractiveId({ x: 0, z: radius + 0.001 }, [validNpc]), null);
});

test("建物とNPCが両方近いときは、種類ではなく距離で決める", () => {
  // 入口(0, 1)の建物と、(0, 3)に立つNPC
  const building = { ...validBuilding, position: { x: 0, y: 1, z: 0 } };
  const npc = { ...validNpc, position: { x: 0, y: 0.66, z: 3 } };

  // (0, 2) からは入口まで1、NPCまで1。同距離なのでidの昇順（bank < npc-test）
  assert.equal(findNearbyInteractiveId({ x: 0, z: 2 }, [building, npc]), "bank");
  // (0, 2.4) からはNPCのほうが近い
  assert.equal(findNearbyInteractiveId({ x: 0, z: 2.4 }, [building, npc]), "npc-test");
});

test("初期マップのNPCに近づくと、そのidが返る", () => {
  const npc = INITIAL_MAP_OBJECTS.find((object) => object.type === "npc");

  // NPCの真横（当たり判定の外）に立つ
  const beside = { x: npc.position.x + 1, z: npc.position.z };

  assert.equal(findNearbyInteractiveId(beside, INITIAL_MAP_OBJECTS), npc.id);
});

// --- 障害物にめり込んだときの脱出（Issue #214） ---

test("障害物にめり込んでいても、そこから抜け出せる", () => {
  // NPCはプレイヤーの位置を見ずに歩くので、乗り上げられて重なることがある。
  // 重なったまま全方向を塞がれると一歩も動けなくなるため、重なっている相手は判定から外す
  const npc = { ...validNpc, position: { x: 0, y: 0.66, z: 0 } };

  const escaped = moveWithinMap({ x: 0, z: 0 }, { x: 0.12, z: 0 }, [npc]);

  assert.ok(escaped.x > 0, `めり込んだまま動けていない: ${JSON.stringify(escaped)}`);
});

test("めり込んでいても、重なっていない別の障害物には止められる", () => {
  // 逃げ道は「今めり込んでいる相手」だけに効かせる。壁まですり抜けては困る
  const npc = { ...validNpc, position: { x: 0, y: 0.66, z: 0 } };
  const wall = {
    collidable: true,
    collisionSize: { depth: 6, width: 1 },
    id: "wall",
    interactive: false,
    model: RPG_HUB_ASSETS.rock,
    position: { x: 1.6, y: 0.25, z: 0 },
    type: "decoration",
  };
  const boundary = wall.position.x - wall.collisionSize.width / 2 - PLAYER_COLLISION_RADIUS;

  let position = { x: 0, z: 0 };
  for (let index = 0; index < 60; index += 1) {
    position = moveWithinMap(position, { x: 0.12, z: 0 }, [npc, wall]);
  }

  assert.ok(position.x > 0, "めり込んだまま動けていない");
  assert.ok(position.x <= boundary + 1e-9, `壁をすり抜けた: x=${position.x}`);
});

// --- マップ配置の決まり（Issue #214） ---

/** 当たり判定の半分の大きさ（scale 込み）。 */
const halfSize = (object) => {
  const scale = object.scale ?? 1;
  return {
    x: (object.collisionSize.width * scale) / 2,
    z: (object.collisionSize.depth * scale) / 2,
  };
};

/** 見た目のおおよその半分の大きさ。当たり判定を持たないものにも使う。 */
const halfVisual = (object) => {
  if (object.collisionSize) return halfSize(object);
  // 道のタイルと草むら。タイルは一辺1.8、草むらは葉の広がりぶん
  const scale = object.scale ?? 1;
  return object.model === RPG_HUB_ASSETS.path
    ? { x: 0.9, z: 0.9 }
    : { x: 0.35 * scale, z: 0.35 * scale };
};

const overlaps = (a, b) => {
  const ha = halfVisual(a);
  const hb = halfVisual(b);
  return (
    Math.abs(a.position.x - b.position.x) < ha.x + hb.x &&
    Math.abs(a.position.z - b.position.z) < ha.z + hb.z
  );
};

test("装飾物が建物の当たり判定に重なっていない", () => {
  // 重なると建物へめり込んで生えて見える。目視では気づきにくいので決まりとして固定する
  const buildings = INITIAL_MAP_OBJECTS.filter((object) => object.type === "building");
  const decorations = INITIAL_MAP_OBJECTS.filter(
    (object) => object.type === "decoration" && object.model !== RPG_HUB_ASSETS.path,
  );

  const stuck = [];
  for (const decoration of decorations) {
    for (const building of buildings) {
      const hb = halfSize(building);
      const hd = halfVisual(decoration);
      if (
        Math.abs(decoration.position.x - building.position.x) < hb.x + hd.x &&
        Math.abs(decoration.position.z - building.position.z) < hb.z + hd.z
      ) {
        stuck.push(`${decoration.id} が ${building.id} に重なっている`);
      }
    }
  }

  assert.deepEqual(stuck, []);
});

test("当たり判定を持つ装飾物が道の上に無い", () => {
  // 道の上に置くと通れなくなる。道は歩く場所を示すためのもの
  const tiles = INITIAL_MAP_OBJECTS.filter((object) => object.model === RPG_HUB_ASSETS.path);
  const blockers = INITIAL_MAP_OBJECTS.filter(
    (object) => object.type === "decoration" && object.collidable,
  );

  const onRoad = [];
  for (const blocker of blockers) {
    for (const tile of tiles) {
      if (overlaps(blocker, tile)) onRoad.push(`${blocker.id} が ${tile.id} の上にある`);
    }
  }

  assert.deepEqual(onRoad, []);
});

test("マップのIDが重複していない", () => {
  // 自動で散らすぶんがあるので、連番の付け方を間違えると静かに上書きされる
  const ids = INITIAL_MAP_OBJECTS.map((object) => object.id);

  assert.equal(new Set(ids).size, ids.length);
});

test("自然物は4つの形がすべて使われている", () => {
  // 1種類の形だけを並べると、散らしても模様のように見える
  const used = new Set(INITIAL_MAP_OBJECTS.map((object) => object.model));

  for (const assetId of [
    RPG_HUB_ASSETS.tree, RPG_HUB_ASSETS.treePine, RPG_HUB_ASSETS.treeTall, RPG_HUB_ASSETS.treeYoung,
    RPG_HUB_ASSETS.bush, RPG_HUB_ASSETS.bushBerry, RPG_HUB_ASSETS.bushTall, RPG_HUB_ASSETS.bushWide,
    RPG_HUB_ASSETS.rock, RPG_HUB_ASSETS.rockFlat, RPG_HUB_ASSETS.rockPile, RPG_HUB_ASSETS.rockTall,
    RPG_HUB_ASSETS.grass, RPG_HUB_ASSETS.grassFlower, RPG_HUB_ASSETS.grassTall, RPG_HUB_ASSETS.grassWide,
  ]) {
    assert.ok(used.has(assetId), `${assetId} が1つも置かれていない`);
  }
});

test("散らした自然物は町の外にあり、決めた範囲に収まっている", () => {
  const scattered = INITIAL_MAP_OBJECTS.filter((object) => object.id.startsWith("scatter-"));

  assert.ok(scattered.length > 100, `散らした数が少ない: ${scattered.length}`);
  for (const object of scattered) {
    const { x, z } = object.position;
    assert.ok(
      Math.abs(x) >= 13 || Math.abs(z) >= 15,
      `${object.id} が町なかに入り込んでいる (${x.toFixed(1)}, ${z.toFixed(1)})`,
    );
    assert.ok(Math.abs(x) <= 34 && Math.abs(z) <= 34, `${object.id} が範囲外`);
  }
});

test("草むらのアセットはすべて影を落とさない側に入っている", () => {
  // 増やしたときに足し忘れると、静かに影のパスだけが重くなる
  const grassAssets = Object.values(RPG_HUB_ASSETS).filter((assetId) =>
    assetId.startsWith("decoration-grass"),
  );

  assert.ok(grassAssets.length >= 4, `草むらのアセットが少ない: ${grassAssets.length}`);
  for (const assetId of grassAssets) {
    assert.ok(NO_SHADOW_ASSETS.has(assetId), `${assetId} が NO_SHADOW_ASSETS に無い`);
  }
  assert.ok(NO_SHADOW_ASSETS.has(RPG_HUB_ASSETS.path), "道のタイルが抜けている");
});

test("建物は回転させていない", () => {
  // 当たり判定は rotationY を反映するようになったが（#198）、接近判定の基準点と出口の位置は
  // 扉の向き（entranceOffset）を回していない。建物を回すと、扉の前に立てないずれが静かに入る
  for (const building of INITIAL_MAP_OBJECTS.filter((object) => object.type === "building")) {
    assert.ok(
      !building.rotationY,
      `${building.id} が回転している。当たり判定・接近判定・出口の計算も合わせる必要がある`,
    );
  }
});

// --- 建物から出てくる位置（Issue #214） ---

test("建物から出てくる位置は、当たり判定の外で扉の側にある", () => {
  for (const building of INITIAL_MAP_OBJECTS.filter((object) => object.type === "building")) {
    const exit = getBuildingExitPoint(building);
    const scale = building.scale ?? 1;

    // 建物の当たり判定の外にいること（中だと出た瞬間に動けなくなる）
    const halfDepth = (building.collisionSize.depth * scale) / 2 + PLAYER_COLLISION_RADIUS;
    assert.ok(
      Math.abs(exit.z - building.position.z) > halfDepth,
      `${building.id}: 当たり判定の中に出てくる`,
    );
    // 扉のある側（+Z）にいること
    assert.ok(exit.z > building.position.z, `${building.id}: 扉と反対側に出ている`);
    // 建物に背を向けている（顔がカメラ側を向く）
    assert.ok(Math.abs(exit.facingY) < 1e-9, `${building.id}: 向きが扉の側でない`);
  }
});

test("建物から出てくる位置は、ほかの当たり判定にも重ならない", () => {
  for (const building of INITIAL_MAP_OBJECTS.filter((object) => object.type === "building")) {
    const exit = getBuildingExitPoint(building);
    // 判定は overlapsObject に任せる（scale と rotationY の扱いを実装と同じにするため）
    const blocking = INITIAL_MAP_OBJECTS.filter((object) => overlapsObject(exit.x, exit.z, object));

    assert.deepEqual(
      blocking.map((object) => object.id),
      [],
      `${building.id} の出口が重なっている`,
    );
  }
});

test("建物から出てくる位置は、その建物に接近できる距離にある", () => {
  // 出てきた直後に「入る」が出ていないと、入り直せずに戸惑う
  for (const building of INITIAL_MAP_OBJECTS.filter((object) => object.type === "building")) {
    const exit = getBuildingExitPoint(building);

    assert.equal(
      findNearbyInteractiveId(exit, INITIAL_MAP_OBJECTS),
      building.id,
      `${building.id} の出口から、その建物に接近できていない`,
    );
  }
});

// --- 会話データ ---

test("dialogueIdから会話の行が引ける", () => {
  const lines = getDialogue("villager-guide");

  assert.ok(Array.isArray(lines));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.equal(typeof line, "string");
    assert.ok(line.length > 0);
  }
});

test("未知のdialogueIdではnullを返し、例外にしない", () => {
  // マップデータだけ更新されて会話が追いついていない場合に、画面を壊さない
  assert.equal(getDialogue("does-not-exist"), null);
  assert.equal(getDialogue(""), null);
});

test("Objectの継承プロパティ名を会話IDとして拾わない", () => {
  // Object.hasOwn で見ているため、toString などが会話として返ってこない
  assert.equal(getDialogue("toString"), null);
  assert.equal(getDialogue("constructor"), null);
});

test("初期マップのNPCは、ほかの当たり判定に重ならない場所に立っている", () => {
  // 重なっていると、その場から歩き出せない（歩き回る実装で詰まる）。
  // 立ち位置を動かしたときに気づけるよう、データ側の決まりとして確かめる
  // 判定は overlapsObject に任せる（scale と rotationY の扱いを実装と同じにするため）
  const blocked = (point, selfId) =>
    INITIAL_MAP_OBJECTS.filter(
      (object) => object.id !== selfId && overlapsObject(point.x, point.z, object),
    );

  for (const npc of INITIAL_MAP_OBJECTS.filter((object) => object.type === "npc")) {
    const overlapping = blocked(npc.position, npc.id);
    assert.deepEqual(
      overlapping.map((object) => object.id),
      [],
      `${npc.id} が重なっている`,
    );
  }
});

test("扉の真正面に立てる位置は、道のタイルの上にあり、その建物に接近できる", () => {
  // 建物の大きさ（BUILDING_SCALE）を変えると、当たり判定の手前の面＝扉の前に立てる位置が
  // 前後に動く。道から外れたり接近範囲から出たりしていないかを、データ側の決まりとして確かめる
  const pathTiles = INITIAL_MAP_OBJECTS.filter((object) => object.id.startsWith("path-"));
  const halfTile = 1.8 / 2;

  for (const building of INITIAL_MAP_OBJECTS.filter((object) => object.type === "building")) {
    const scale = building.scale ?? 1;
    // 扉はすべて +Z 向き。当たり判定に阻まれて、これ以上は扉へ近づけない
    const standing = {
      x: building.position.x,
      z: building.position.z + (building.collisionSize.depth * scale) / 2 + PLAYER_COLLISION_RADIUS,
    };

    const onPath = pathTiles.some(
      (tile) =>
        Math.abs(standing.x - tile.position.x) <= halfTile &&
        Math.abs(standing.z - tile.position.z) <= halfTile,
    );
    assert.ok(onPath, `${building.id} の扉の前(z=${standing.z.toFixed(2)})が道から外れている`);

    assert.equal(
      findNearbyInteractiveId(standing, INITIAL_MAP_OBJECTS),
      building.id,
      `${building.id} の扉の前で、その建物に接近できていない`,
    );
  }
});

test("初期マップのNPCは、すべて会話データを持っている", () => {
  const npcs = INITIAL_MAP_OBJECTS.filter((object) => object.type === "npc");

  assert.ok(npcs.length > 0, "NPCが1体もいない");
  for (const npc of npcs) {
    assert.ok(getDialogue(npc.dialogueId), `${npc.id} の会話データ（${npc.dialogueId}）がない`);
  }
});
