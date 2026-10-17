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
  assert.equal(getDefaultPaletteColor("dog", "skin"), "#e3b37a");
  assert.equal(getDefaultPaletteColor("dog", "accent"), "#8a5a33");
  assert.equal(getDefaultPaletteColor("panda", "skin"), "#f5f5f0");
  assert.equal(getDefaultPaletteColor("panda", "accent"), "#2b2b2b");
});

test("パンダを選べる（Issue #446）", () => {
  assert.equal(isCharacterType("panda"), true);
  assert.equal(CHARACTER_TYPE_LABELS.panda, "パンダ");
  assert.equal(CHARACTER_TYPE_ASSET_IDS.panda, RPG_HUB_ASSETS.playerPanda);
});

test("手足を別の色にしたキャラクターは、手足を差し色（accent）の枠にする（パンダ）", () => {
  // 体の色（skin）を変えたときに、黒い手足まで同じ色に塗られないようにする
  const limbs = getBuildingParts(RPG_HUB_ASSETS.playerPanda).filter((part) => part.limb);
  assert.equal(limbs.length, 4);
  for (const limb of limbs) {
    assert.equal(limb.paletteSlot, "accent");
    assert.equal(limb.color, "#2b2b2b");
  }
});

test("手足の色を指定しないキャラクターは、手足も体の色（skin）の枠のまま", () => {
  const limbs = getBuildingParts(RPG_HUB_ASSETS.playerDog).filter((part) => part.limb);
  assert.equal(limbs.length, 4);
  for (const limb of limbs) assert.equal(limb.paletteSlot, "skin");
});

test("中の値 hamster は、表示名を「リス」にしてある（Issue #446）", () => {
  // 保存済みの値を変えずに、表示名だけを変えた。値を変えると、DBの行と制約も直す必要がある
  assert.equal(CHARACTER_TYPE_LABELS.hamster, "リス");
  assert.equal(isCharacterType("squirrel"), false);
});

test("リスのしっぽは、背中に付いた四角い板で、左右の面に渦巻き模様がある（Issue #446）", () => {
  const parts = getBuildingParts(CHARACTER_TYPE_ASSET_IDS.hamster);
  // 胴の背中（z = -0.16）より後ろのパーツがしっぽ
  const tail = parts.filter((part) => part.position.z < -0.16);
  assert.ok(tail.length > 0, "しっぽが無い");

  // つなぎ目がずれないよう、しっぽの箱はどれも回転させない
  for (const part of tail) assert.equal(part.rotation, undefined);

  // 模様は左右の面（±X）に同じ数ずつ貼る。四角い渦巻きは、少なくとも1周（4本）以上の線でできている
  const pattern = tail.filter((part) => part.paletteSlot === "accent");
  const right = pattern.filter((part) => part.position.x > 0);
  const left = pattern.filter((part) => part.position.x < 0);
  assert.equal(right.length, left.length);
  assert.ok(right.length >= 5, `渦巻きの線が足りない（${right.length}本）`);

  // 付け根の箱を置かず、板を胴の背中（z = -0.16）に直接付ける
  const board = tail.find((part) => part.paletteSlot === "skin");
  assert.equal(tail.filter((part) => part.paletteSlot === "skin").length, 1, "しっぽの板以外の箱がある");
  assert.ok(board.position.z + board.depth / 2 > -0.16, "しっぽが背中から離れている");

  for (const part of tail) {
    const top = part.position.y + part.height / 2;
    const bottom = part.position.y - part.height / 2;
    const front = part.position.z + part.depth / 2;
    // 地面（足の裏 y = -0.34）に埋まらない
    assert.ok(bottom > -0.34, "しっぽが地面に埋まっている");
    // 頭（y = 0.22〜0.62、背面 z = -0.28）に刺さらない
    assert.ok(!(top > 0.22 && bottom < 0.62 && front > -0.28), "しっぽが頭に刺さっている");
    // 頭のてっぺんより高い所は、いちばん広い帽子のつば（麦わら帽子・半径0.475）より後ろにある
    assert.ok(!(top > 0.62 && front > -0.475), "しっぽが帽子のつばに刺さる");
  }
});

test("いぬを選べる（Issue #446）", () => {
  assert.equal(isCharacterType("dog"), true);
  assert.equal(CHARACTER_TYPE_LABELS.dog, "いぬ");
  assert.equal(CHARACTER_TYPE_ASSET_IDS.dog, RPG_HUB_ASSETS.playerDog);
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
