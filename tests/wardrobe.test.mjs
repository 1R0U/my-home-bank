import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATALOG, getAssetLabel } from "../lib/rpg-hub/catalog.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import {
  applyEquipmentDraft,
  applyPaletteDraft,
  getEquipmentChanges,
  getPaletteChanges,
  toEquipment,
  toOwnedWearables,
  withSlotEquipped,
} from "../lib/rpg-hub/wardrobe.ts";
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
  // キャラクター（player・playerRabbit・villager）はどれも着せ替え品の枠を
  // 申告していないので選べない。キャラクターの姿を選ぶ仕組みは別（character_appearances）
  const { assetIds } = toOwnedWearables([
    { asset_id: RPG_HUB_ASSETS.bank },
    { asset_id: RPG_HUB_ASSETS.tree },
    { asset_id: RPG_HUB_ASSETS.villager },
    { asset_id: RPG_HUB_ASSETS.player },
    { asset_id: RPG_HUB_ASSETS.playerRabbit },
  ]);

  assert.deepEqual(assetIds, []);
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
  // 無いとアセットIDがそのまま画面に出る
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (definition.slot === undefined) continue;
    assert.ok(definition.label, `${key} に label がない`);
    assert.equal(getAssetLabel(definition.id), definition.label);
  }
});

test("label を持つのは着せ替え品・装飾だけ", () => {
  // 建物・キャラクターは選ばせる物ではない（キャラクターの表示名は
  // CHARACTER_TYPE_LABELS が別に持つ）ので、名前を持たない
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (!definition.label) continue;
    const selectable = definition.category === "wearable" || definition.category === "decoration";
    assert.ok(selectable, `${key} は選べる物でないのに label を持つ`);
  }
});

test("すべての枠に表示名がある", () => {
  for (const slot of EQUIPMENT_SLOTS) {
    assert.ok(EQUIPMENT_SLOT_LABELS[slot], `${slot} の表示名がない`);
  }
});

// --- 更衣室の下書き（Issue #344） ---

test("1つの枠だけを着け替え、元の装備は書き換えない", () => {
  const saved = { head: HAT };
  const next = withSlotEquipped(saved, "face", GLASSES);

  assert.deepEqual(next, { face: GLASSES, head: HAT });
  assert.deepEqual(saved, { head: HAT });
});

test("脱ぐと枠そのものが無くなる", () => {
  // undefined の枠が残ると、DBから作る保存済みの装備（脱いだ枠を持たない）と食い違う
  const next = withSlotEquipped({ face: GLASSES, head: HAT }, "head", null);

  assert.deepEqual(next, { face: GLASSES });
  assert.equal("head" in next, false);
});

test("何も変えていなければ変更は無い", () => {
  assert.deepEqual(getEquipmentChanges({ head: HAT }, { head: HAT }), []);
  assert.deepEqual(getEquipmentChanges({}, {}), []);
});

test("変えてから元に戻した枠は変更として数えない", () => {
  const saved = { head: HAT };
  const draft = withSlotEquipped(withSlotEquipped(saved, "head", null), "head", HAT);

  assert.deepEqual(getEquipmentChanges(saved, draft), []);
});

test("着けた枠・脱いだ枠を、枠の決まった順に返す", () => {
  const changes = getEquipmentChanges({ head: HAT }, { face: GLASSES });

  assert.deepEqual(
    changes,
    EQUIPMENT_SLOTS.filter((slot) => slot === "face" || slot === "head").map((slot) =>
      slot === "face" ? { assetId: GLASSES, slot } : { assetId: null, slot },
    ),
  );
});

test("下書きで選び直した枠だけを、保存済みの装備に重ねる", () => {
  assert.deepEqual(applyEquipmentDraft({ head: HAT }, {}), { head: HAT });
  assert.deepEqual(applyEquipmentDraft({ head: HAT }, { face: GLASSES }), { face: GLASSES, head: HAT });
  // null は「脱ぐ」
  assert.deepEqual(applyEquipmentDraft({ face: GLASSES, head: HAT }, { head: null }), { face: GLASSES });
});

test("選んでいる間に保存済みの装備が変わっても、触っていない枠は変更に数えない（PR #346 レビュー対応）", () => {
  // 帽子あり・眼鏡なしで眼鏡を選ぶ。その間に別の端末で帽子を外し、読み直しで保存済みが {} になる
  const draft = { face: GLASSES };
  const reloaded = {};

  const shown = applyEquipmentDraft(reloaded, draft);

  assert.deepEqual(shown, { face: GLASSES });
  // 外した帽子を付け直さない
  assert.deepEqual(getEquipmentChanges(reloaded, shown), [{ assetId: GLASSES, slot: "face" }]);
});

// --- 色の下書き（Issue #381） ---

const BLUE = "#4a90e2";
const RED = "#e74c3c";

test("色の下書きで選び直した枠だけを、保存済みの色に重ねる", () => {
  assert.deepEqual(applyPaletteDraft({ skin: BLUE }, {}), { skin: BLUE });
  assert.deepEqual(applyPaletteDraft({ skin: BLUE }, { accent: RED }), { accent: RED, skin: BLUE });
  // null は「もとのいろ」。差し替えそのものを消す
  assert.deepEqual(applyPaletteDraft({ accent: RED, skin: BLUE }, { skin: null }), { accent: RED });
});

test("色の下書きを重ねても、保存済みの色は書き換えない", () => {
  const saved = { skin: BLUE };
  applyPaletteDraft(saved, { skin: RED });
  assert.deepEqual(saved, { skin: BLUE });
});

test("色を変えていなければ変更は無い", () => {
  assert.deepEqual(getPaletteChanges({ skin: BLUE }, { skin: BLUE }), []);
  assert.deepEqual(getPaletteChanges({}, {}), []);
});

test("色を変えてから元に戻した枠は変更として数えない", () => {
  const saved = { skin: BLUE };
  const shown = applyPaletteDraft(saved, { skin: BLUE });
  assert.deepEqual(getPaletteChanges(saved, shown), []);
});

test("変えた枠・もとのいろへ戻した枠を、決まった順（skin, accent）で返す", () => {
  const saved = { accent: RED };
  const shown = applyPaletteDraft(saved, { accent: null, skin: BLUE });

  assert.deepEqual(getPaletteChanges(saved, shown), [
    { color: BLUE, slot: "skin" },
    { color: null, slot: "accent" },
  ]);
});

test("選べない枠（hair）は、保存済みと違っても変更に数えない", () => {
  // 更衣室で触れない枠を、確定のたびに消したり書いたりしない
  assert.deepEqual(getPaletteChanges({ hair: BLUE }, {}), []);
});
