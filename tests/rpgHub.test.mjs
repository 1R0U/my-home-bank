import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS, resolveAssetId } from "../lib/rpg-hub/assets.ts";
import {
  INITIAL_MAP_OBJECTS,
  parseMapObject,
  parseMapObjects,
} from "../lib/rpg-hub/mapObjects.ts";
import {
  findNearbyBuildingId,
  getJoystickMovement,
  getLocalTouchPosition,
  moveWithinMap,
  PLAYER_COLLISION_RADIUS,
} from "../lib/rpg-hub/movement.ts";
import { getSeason } from "../lib/rpg-hub/season.ts";
import { MAP_ROUTES } from "../types/map.ts";

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
  assert.equal(MAP_ROUTES.history, "/history");
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

  assert.equal(findNearbyBuildingId({ x: 0, z: 4.5 }, [building]), "bank");
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
  const result = findNearbyBuildingId({ x: 0, z: 2 }, [building]);
  assert.equal(result, "bank");
});

test("接近範囲外の建物は対象にしない", () => {
  const building = { ...validBuilding, position: { x: 0, y: 1, z: 0 } };
  const result = findNearbyBuildingId({ x: 0, z: 20 }, [building]);
  assert.equal(result, null);
});

test("複数の建物が範囲内にある場合は入口までの距離が最短のものを選ぶ", () => {
  const near = { ...validBuilding, id: "near", position: { x: 1, y: 1, z: 0 } };
  const far = { ...validBuilding, id: "far", position: { x: -2, y: 1, z: 0 } };
  const result = findNearbyBuildingId({ x: 0, z: 0 }, [far, near]);
  assert.equal(result, "near");
});

test("距離が同じ場合はidの昇順で決定する", () => {
  const b = { ...validBuilding, id: "b", position: { x: 1, y: 1, z: 0 } };
  const a = { ...validBuilding, id: "a", position: { x: -1, y: 1, z: 0 } };
  const result = findNearbyBuildingId({ x: 0, z: -1 }, [b, a]);
  assert.equal(result, "a");
});

test("装飾やNPCは接近判定の対象にしない", () => {
  const tree = {
    collidable: false,
    id: "tree",
    interactive: false,
    model: RPG_HUB_ASSETS.tree,
    position: { x: 0, y: 0.8, z: 0 },
    type: "decoration",
  };
  const npc = {
    collidable: false,
    dialogueId: "test-npc",
    id: "npc",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.tree,
    position: { x: 0, y: 0, z: 0 },
    type: "npc",
  };
  const result = findNearbyBuildingId({ x: 0, z: 0 }, [tree, npc]);
  assert.equal(result, null);
});
