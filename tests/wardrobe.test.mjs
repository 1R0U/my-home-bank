import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATALOG, getAssetLabel } from "../lib/rpg-hub/catalog.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { toEquipment, toOwnedWearables } from "../lib/rpg-hub/wardrobe.ts";
import { createSetPlayerEquipmentIntent, parseIntent } from "../lib/rpg-hub/bridge.ts";
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from "../types/map.ts";

/**
 * 所有と装備の読み込み（Issue #222）。
 *
 * **DBは外から来るデータとして扱う。** カタログから消えたIDが残っていても、
 * その枠を空として扱って描画を続ける。1件のせいでキャラクターが消えるのが一番まずい。
 */

const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;

// --- 持ちもの ---

test("持っている着せ替え品を、カタログの順で返す", () => {
  // DBの取得順に任せると、取り直すたびに並びが変わって押し間違える
  const { assetIds, errors } = toOwnedWearables([{ asset_id: HAT }, { asset_id: GLASSES }]);
  const reversed = toOwnedWearables([{ asset_id: GLASSES }, { asset_id: HAT }]);

  assert.deepEqual(errors, []);
  assert.deepEqual(assetIds, reversed.assetIds, "入力の順で並びが変わっている");
  assert.equal(assetIds.length, 2);
});

test("カタログに無いIDは捨てて、残りを返す", () => {
  // アイテムを消したときに、持っている人の画面が壊れないこと
  const { assetIds, errors } = toOwnedWearables([
    { asset_id: "wearable-nonexistent" },
    { asset_id: HAT },
  ]);

  assert.deepEqual(assetIds, [HAT]);
  assert.equal(errors.length, 1);
});

test("着せ替え品でないIDは持ちものに出さない", () => {
  // villager（住人）は body 枠を申告していないので選べない。
  // player（カエル）は body 枠のキャラクターなので、ここでは対象外にしない（Issue #235）
  const { assetIds } = toOwnedWearables([
    { asset_id: RPG_HUB_ASSETS.bank },
    { asset_id: RPG_HUB_ASSETS.tree },
    { asset_id: RPG_HUB_ASSETS.villager },
  ]);

  assert.deepEqual(assetIds, []);
});

test("body枠のキャラクター（どうぶつ）は持ちものに出る", () => {
  const { assetIds, errors } = toOwnedWearables([
    { asset_id: RPG_HUB_ASSETS.player },
    { asset_id: RPG_HUB_ASSETS.rabbit },
  ]);

  assert.deepEqual(errors, []);
  assert.equal(assetIds.length, 2);
  assert.ok(assetIds.includes(RPG_HUB_ASSETS.player));
  assert.ok(assetIds.includes(RPG_HUB_ASSETS.rabbit));
});

test("壊れた行が混ざっても落ちない", () => {
  const { assetIds } = toOwnedWearables([{}, { asset_id: null }, { asset_id: 42 }, { asset_id: HAT }]);

  assert.deepEqual(assetIds, [HAT]);
});

// --- 着ているもの ---

test("持っているものは着られる", () => {
  const { equipment, errors } = toEquipment([{ asset_id: HAT, slot: "head" }], [HAT]);

  assert.deepEqual(errors, []);
  assert.deepEqual(equipment, { head: HAT });
});

test("持っていないものは着せない", () => {
  // DBの外部キーでも防いでいるが、片方だけに頼ると手で入れた行で抜ける
  const { equipment, errors } = toEquipment([{ asset_id: HAT, slot: "head" }], []);

  assert.deepEqual(equipment, {});
  assert.equal(errors.length, 1);
});

test("枠とアイテムの申告が食い違うものは着せない", () => {
  // 着せても resolveEquipment に黙って落とされ、出てこない理由が分からなくなる
  const { equipment } = toEquipment([{ asset_id: GLASSES, slot: "head" }], [GLASSES]);

  assert.deepEqual(equipment, {});
});

test("知らない枠は捨てて、残りは着せる", () => {
  // 1件のせいで裸にならないこと
  const { equipment, errors } = toEquipment(
    [
      { asset_id: HAT, slot: "hand" },
      { asset_id: HAT, slot: "head" },
    ],
    [HAT],
  );

  assert.deepEqual(equipment, { head: HAT });
  assert.equal(errors.length, 1);
});

test("カタログから消えたIDが装備に残っていても、その枠が空になるだけ", () => {
  const { equipment } = toEquipment(
    [
      { asset_id: "wearable-nonexistent", slot: "head" },
      { asset_id: GLASSES, slot: "face" },
    ],
    [GLASSES],
  );

  assert.deepEqual(equipment, { face: GLASSES });
});

// --- WebView へ送る意図 ---

test("装備の意図は往復しても同じ", () => {
  const intent = createSetPlayerEquipmentIntent({ face: GLASSES, head: HAT });
  const result = parseIntent(JSON.stringify(intent));

  assert.equal(result.success, true);
  assert.deepEqual(result.intent.equipment, { face: GLASSES, head: HAT });
});

test("送られてきた装備のうち、着けられないものだけを落とす", () => {
  // 意図ごと捨てると裸になる。着けられる分は着せる
  const result = parseIntent(
    JSON.stringify({
      equipment: { face: GLASSES, hand: HAT, head: "wearable-nonexistent" },
      type: "setPlayerEquipment",
    }),
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.intent.equipment, { face: GLASSES });
});

test("装備がオブジェクトでない意図は弾く", () => {
  for (const equipment of ["head", 42, null, ["head"]]) {
    const result = parseIntent(JSON.stringify({ equipment, type: "setPlayerEquipment" }));

    assert.equal(result.success, false, JSON.stringify(equipment));
  }
});

// --- 表示名 ---

test("着せ替え画面で選べるものには必ず表示名がある", () => {
  // 無いとアセットIDがそのまま画面に出る。wearable だけでなく、
  // body枠のキャラクター（カエル・うさぎなど）も選べるものの1つ（Issue #235）
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (definition.slot === undefined) continue;
    assert.ok(definition.label, `${key} に label がない`);
    assert.equal(getAssetLabel(definition.id), definition.label);
  }
});

test("label を持つのは着せ替え品・装飾・選べるキャラクターだけ", () => {
  // 建物や、選べない住人などは選ばせる物ではないので、名前を持たない
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (!definition.label) continue;
    const selectable =
      definition.category === "wearable" ||
      definition.category === "decoration" ||
      (definition.category === "character" && definition.slot !== undefined);
    assert.ok(selectable, `${key} は選べる物でないのに label を持つ`);
  }
});

test("すべての枠に表示名がある", () => {
  for (const slot of EQUIPMENT_SLOTS) {
    assert.ok(EQUIPMENT_SLOT_LABELS[slot], `${slot} の表示名がない`);
  }
});
