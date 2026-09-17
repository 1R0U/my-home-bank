import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATALOG, getSlotAnchor, getWearableSlot } from "../lib/rpg-hub/catalog.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import {
  DEFAULT_PLAYER_EQUIPMENT,
  resolveEquipment,
} from "../lib/rpg-hub/equipment.ts";
import { parseMapObject } from "../lib/rpg-hub/mapObjects.ts";

/**
 * 着せ替えの装着スロット（Issue #221）。
 *
 * **この仕組みの肝は「アイテムが座標を持たないこと」。** 持ってしまうと、仮置きのカエルを
 * 本番のキャラクターへ差し替えるときに全アイテムを作り直すことになる。
 */

// --- 付く位置はキャラクターが決める ---

test("帽子はキャラクターの head アンカーの位置に付く", () => {
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, { head: RPG_HUB_ASSETS.wearableHat });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].assetId, RPG_HUB_ASSETS.wearableHat);
  assert.equal(resolved[0].slot, "head");
  assert.deepEqual(resolved[0].anchor.position, ASSET_CATALOG.player.anchors.head.position);
});

test("同じアイテムでも、キャラクターが違えば付く位置と大きさが変わる", () => {
  // #221 の完了条件そのもの。アイテム定義（wearableHat）は片方だけに寄せていない
  const onPlayer = resolveEquipment(RPG_HUB_ASSETS.player, { head: RPG_HUB_ASSETS.wearableHat });
  const onVillager = resolveEquipment(RPG_HUB_ASSETS.villager, {
    head: RPG_HUB_ASSETS.wearableHat,
  });

  assert.equal(onPlayer[0].assetId, onVillager[0].assetId, "同じアイテムを見ていない");
  assert.equal(onPlayer[0].parts, onVillager[0].parts, "形まで別物になっている");
  assert.notDeepEqual(
    onPlayer[0].anchor.position,
    onVillager[0].anchor.position,
    "キャラクターを変えても位置が変わっていない（アイテム側が座標を持っている疑い）",
  );
  assert.notEqual(onPlayer[0].anchor.scale, onVillager[0].anchor.scale);
});

test("アンカーを差し替えると、アイテムを触らずに位置が変わる", () => {
  // キャラクター差し替えの練習。カタログのアンカーだけが位置を決めていることの確認
  const before = resolveEquipment(RPG_HUB_ASSETS.player, { head: RPG_HUB_ASSETS.wearableHat });
  const original = ASSET_CATALOG.player.anchors.head;
  ASSET_CATALOG.player.anchors.head = { position: { x: 9, y: 9, z: 9 }, scale: 3 };
  try {
    const after = resolveEquipment(RPG_HUB_ASSETS.player, { head: RPG_HUB_ASSETS.wearableHat });

    assert.deepEqual(after[0].anchor.position, { x: 9, y: 9, z: 9 });
    assert.equal(after[0].anchor.scale, 3);
    assert.equal(after[0].parts, before[0].parts, "アイテムの形まで変わっている");
  } finally {
    ASSET_CATALOG.player.anchors.head = original;
  }
});

test("省略した回転と拡大率は既定値で埋まる", () => {
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, { head: RPG_HUB_ASSETS.wearableHat });

  assert.deepEqual(resolved[0].anchor.rotation, { x: 0, y: 0, z: 0 });
  assert.equal(resolved[0].anchor.scale, 1);
});

// --- 付けられないものは黙って落とす ---

test("枠とアイテムの申告が食い違うものは付けない", () => {
  // 顔用のめがねを頭の枠へ入れると、頭の上に浮いてしまう
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, {
    head: RPG_HUB_ASSETS.wearableGlasses,
  });

  assert.deepEqual(resolved, []);
});

test("着せ替え品でないアセットは付けない", () => {
  for (const assetId of [RPG_HUB_ASSETS.bank, RPG_HUB_ASSETS.tree, RPG_HUB_ASSETS.villager]) {
    assert.deepEqual(resolveEquipment(RPG_HUB_ASSETS.player, { head: assetId }), [], assetId);
  }
});

test("キャラクターでない相手には何も付かない", () => {
  // 建物に帽子をかぶせようとしても、アンカーが無いので落ちる
  const resolved = resolveEquipment(RPG_HUB_ASSETS.bank, { head: RPG_HUB_ASSETS.wearableHat });

  assert.deepEqual(resolved, []);
});

test("その枠のアンカーを持たないキャラクターには付かない", () => {
  // back のアンカーはまだどのキャラクターにも無い
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, { back: RPG_HUB_ASSETS.wearableHat });

  assert.deepEqual(resolved, []);
});

test("装備なしは空を返す", () => {
  assert.deepEqual(resolveEquipment(RPG_HUB_ASSETS.player, undefined), []);
  assert.deepEqual(resolveEquipment(RPG_HUB_ASSETS.player, {}), []);
});

test("並びは枠の順で固定される", () => {
  // メッシュ名が実行ごとに入れ替わらないようにするため
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, {
    face: RPG_HUB_ASSETS.wearableGlasses,
    head: RPG_HUB_ASSETS.wearableHat,
  });

  assert.deepEqual(
    resolved.map((item) => item.slot),
    ["face", "head"],
  );
});

test("既定のプレイヤー装備は、書いたものが残らず付く", () => {
  // 1つでも枠やIDを書き間違えると resolveEquipment に黙って落とされる。
  // 「長さが0でない」だけだと、2つのうち1つが落ちていても通ってしまう
  const slots = Object.keys(DEFAULT_PLAYER_EQUIPMENT);
  const resolved = resolveEquipment(RPG_HUB_ASSETS.player, DEFAULT_PLAYER_EQUIPMENT);

  assert.ok(slots.length > 0, "既定の装備が空になっている");
  assert.deepEqual(
    resolved.map((item) => item.slot).sort(),
    slots.sort(),
    "既定の装備のうち、付かずに落ちているものがある",
  );
});

// --- 外部入力の検証（DBに保存されるのはこの形） ---

const npcBase = {
  collidable: false,
  dialogueId: "villager-1",
  id: "npc-1",
  interactionRadius: 1.5,
  interactive: true,
  model: RPG_HUB_ASSETS.villager,
  name: "むらびと",
  position: { x: 0, y: 0, z: 0 },
  type: "npc",
};

test("正しい装備はパースを通る", () => {
  const result = parseMapObject({ ...npcBase, equipment: { head: RPG_HUB_ASSETS.wearableHat } });

  assert.equal(result.success, true, result.errors?.join(" / "));
  assert.deepEqual(result.object.equipment, { head: RPG_HUB_ASSETS.wearableHat });
});

test("枠と食い違う装備はパースで弾く", () => {
  // 保存できてしまうと「入れたのに出てこない」状態になる
  const result = parseMapObject({
    ...npcBase,
    equipment: { head: RPG_HUB_ASSETS.wearableGlasses },
  });

  assert.equal(result.success, false);
  assert.ok(result.errors.includes("equipmentが不正です"));
});

test("知らない枠や着せ替え品でないアセットはパースで弾く", () => {
  for (const equipment of [
    { hand: RPG_HUB_ASSETS.wearableHat },
    { head: RPG_HUB_ASSETS.bank },
    { head: "wearable-nonexistent" },
    { head: 42 },
    "head",
  ]) {
    const result = parseMapObject({ ...npcBase, equipment });

    assert.equal(result.success, false, JSON.stringify(equipment));
  }
});

test("キャラクターでないものに装備を持たせるとパースで弾く", () => {
  // アンカーが無いので resolveEquipment に黙って落とされ、
  // 「保存できたのに出てこない」状態になる（枠違いと同じ理由）
  const cases = [
    {
      collidable: true,
      collisionSize: { depth: 0.6, width: 0.6 },
      id: "d1",
      interactive: false,
      model: RPG_HUB_ASSETS.tree,
      position: { x: 0, y: 0, z: 0 },
      type: "decoration",
    },
    {
      collidable: true,
      collisionSize: { depth: 3, width: 3 },
      entranceOffset: { x: 0, y: 0, z: 1 },
      id: "b1",
      interactionRadius: 1.5,
      interactive: true,
      model: RPG_HUB_ASSETS.bank,
      position: { x: 0, y: 0, z: 0 },
      route: "bank",
      type: "building",
    },
  ];

  for (const base of cases) {
    const result = parseMapObject({ ...base, equipment: { head: RPG_HUB_ASSETS.wearableHat } });

    assert.equal(result.success, false, `${base.model} に装備を持たせられてしまう`);
    assert.ok(result.errors.includes("equipmentを付けられないアセットです"));
  }
});

test("装備を指定しなければ equipment は生えない", () => {
  const result = parseMapObject(npcBase);

  assert.equal(result.success, true);
  assert.equal("equipment" in result.object, false);
});

// --- 引きの関数 ---

test("getWearableSlot は着せ替え品にだけ答える", () => {
  assert.equal(getWearableSlot(RPG_HUB_ASSETS.wearableHat), "head");
  assert.equal(getWearableSlot(RPG_HUB_ASSETS.wearableGlasses), "face");
  assert.equal(getWearableSlot(RPG_HUB_ASSETS.player), null);
  assert.equal(getWearableSlot("wearable-nonexistent"), null);
});

test("getSlotAnchor はキャラクターにだけ答える", () => {
  assert.ok(getSlotAnchor(RPG_HUB_ASSETS.player, "head"));
  assert.equal(getSlotAnchor(RPG_HUB_ASSETS.bank, "head"), null);
  assert.equal(getSlotAnchor(RPG_HUB_ASSETS.player, "back"), null);
});
