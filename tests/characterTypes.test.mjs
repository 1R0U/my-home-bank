import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { getBuildingParts } from "../lib/rpg-hub/catalog.ts";
import {
  CHARACTER_TYPES,
  CHARACTER_TYPE_ASSET_IDS,
  CHARACTER_TYPE_LABELS,
  DEFAULT_CHARACTER_TYPE,
  getDefaultPaletteColor,
  isCharacterType,
} from "../lib/rpg-hub/characterTypes.ts";

test("既定値は選べる種類の一覧に含まれる", () => {
  assert.ok(CHARACTER_TYPES.includes(DEFAULT_CHARACTER_TYPE));
});

test("すべての種類にラベルとアセットIDの対応がある", () => {
  for (const type of CHARACTER_TYPES) {
    assert.ok(CHARACTER_TYPE_LABELS[type], `${type} にラベルが無い`);
    assert.ok(CHARACTER_TYPE_ASSET_IDS[type], `${type} にアセットIDが無い`);
  }
});

test("すべての種類のアセットIDがカタログに実在し、形を持つ", () => {
  // カタログ側の書き足し漏れ（IDだけ足して定義を忘れる等）を検知する
  for (const type of CHARACTER_TYPES) {
    const assetId = CHARACTER_TYPE_ASSET_IDS[type];
    assert.ok(getBuildingParts(assetId).length > 0, `${type}（${assetId}）に形が無い`);
  }
});

test("アセットIDは重複しない", () => {
  // 2つの種類が同じ形を指してしまうと、選び分けても見た目が変わらない
  const ids = CHARACTER_TYPES.map((type) => CHARACTER_TYPE_ASSET_IDS[type]);
  assert.equal(new Set(ids).size, ids.length);
});

test("isCharacterTypeは選べる種類だけをtrueにする", () => {
  for (const type of CHARACTER_TYPES) {
    assert.equal(isCharacterType(type), true);
  }
  assert.equal(isCharacterType("dragon"), false);
  assert.equal(isCharacterType(""), false);
  assert.equal(isCharacterType(undefined), false);
  assert.equal(isCharacterType(null), false);
  assert.equal(isCharacterType(123), false);
});

test("カエルの既定値は既存のplayer-defaultのまま（既存の見た目を変えない）", () => {
  assert.equal(CHARACTER_TYPE_ASSET_IDS.frog, RPG_HUB_ASSETS.player);
});

test("元の色（もとのいろ）は、その枠を使うパーツの色を返す（Issue #381）", () => {
  // 色の候補に無い、各キャラクターの元の色を見本として出すため
  assert.equal(getDefaultPaletteColor("frog", "skin"), "#4fae3f");
  assert.equal(getDefaultPaletteColor("frog", "accent"), "#2f7a2a");
  assert.equal(getDefaultPaletteColor("rabbit", "skin"), "#fdf7ee");
  assert.equal(getDefaultPaletteColor("cat", "accent"), "#c9702a");
});

test("どの種類も、色を選べる2枠（skin / accent）の元の色を持つ（Issue #381）", () => {
  // 持たない枠があると、更衣室で選んでも見た目が変わらない枠を出してしまう
  for (const type of CHARACTER_TYPES) {
    for (const slot of ["skin", "accent"]) {
      assert.match(getDefaultPaletteColor(type, slot) ?? "", /^#[0-9a-f]{6}$/i, `${type} の ${slot}`);
    }
  }
});

test("どのキャラクターも使わない枠（hair）は元の色が無い", () => {
  for (const type of CHARACTER_TYPES) {
    assert.equal(getDefaultPaletteColor(type, "hair"), null, type);
  }
});
