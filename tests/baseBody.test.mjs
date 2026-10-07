import assert from "node:assert/strict";
import test from "node:test";
import { createBaseBodyParts } from "../lib/rpg-hub/buildingParts.ts";
import { getBuildingParts, getSlotAnchor } from "../lib/rpg-hub/catalog.ts";
import { CHARACTER_TYPE_ASSET_IDS, CHARACTER_TYPES } from "../lib/rpg-hub/characterTypes.ts";

// 基本の体（Issue #332）の寸法ルールを確かめる。
// 全キャラクターがこの体にパーツを足して作られるため、ここが崩れると
// 着せ替え品の位置や当たり判定が全員分まとめてずれる。

/**
 * 箱のパーツの、軸ごとの端（最小・最大）を求める。
 * @param parts - 箱だけでできたパーツ一覧
 * @returns 各軸の最小・最大
 */
function boundsOf(parts) {
  const bounds = {
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    minX: Infinity, minY: Infinity, minZ: Infinity,
  };
  for (const part of parts) {
    assert.equal(part.shape, "box", "基本の体は箱だけで作る前提");
    bounds.minX = Math.min(bounds.minX, part.position.x - part.width / 2);
    bounds.maxX = Math.max(bounds.maxX, part.position.x + part.width / 2);
    bounds.minY = Math.min(bounds.minY, part.position.y - part.height / 2);
    bounds.maxY = Math.max(bounds.maxY, part.position.y + part.height / 2);
    bounds.minZ = Math.min(bounds.minZ, part.position.z - part.depth / 2);
    bounds.maxZ = Math.max(bounds.maxZ, part.position.z + part.depth / 2);
  }
  return bounds;
}

test("基本の体は当たり判定の直径（0.9）に収まる横幅・奥行きになっている", () => {
  const bounds = boundsOf(createBaseBodyParts("#e8934a"));
  assert.ok(bounds.maxX - bounds.minX <= 0.9);
  assert.ok(bounds.maxZ - bounds.minZ <= 0.9);
});

test("基本の体は足底が y = -0.34、頭のてっぺんが y = 0.62 になっている", () => {
  const bounds = boundsOf(createBaseBodyParts("#e8934a"));
  assert.ok(Math.abs(bounds.minY - -0.34) < 1e-9);
  assert.ok(Math.abs(bounds.maxY - 0.62) < 1e-9);
});

test("基本の体は左右対称になっている", () => {
  const bounds = boundsOf(createBaseBodyParts("#e8934a"));
  assert.ok(Math.abs(bounds.minX + bounds.maxX) < 1e-9);
});

test("基本の体は渡した色で、すべて skin の枠として作られる", () => {
  const parts = createBaseBodyParts("#123456");
  assert.ok(parts.length > 0);
  for (const part of parts) {
    assert.equal(part.color, "#123456");
    assert.equal(part.paletteSlot, "skin");
  }
});

test("基本の体は呼ぶたびに新しい配列を返す（足したパーツが他のキャラクターへ漏れない）", () => {
  const first = createBaseBodyParts("#e8934a");
  first.push(first[0]);
  assert.notEqual(createBaseBodyParts("#e8934a").length, first.length);
});

test("選べるキャラクターはすべて、基本の体にパーツを足して作られている", () => {
  for (const type of CHARACTER_TYPES) {
    const parts = getBuildingParts(CHARACTER_TYPE_ASSET_IDS[type]);
    const base = createBaseBodyParts(parts[0].color);
    assert.deepEqual(parts.slice(0, base.length), base, `${type} が基本の体から始まっていない`);
    assert.ok(parts.length > base.length, `${type} に個性を出すパーツが足されていない`);
  }
});

test("基本の体の足と手には、歩くときに振る目印（limb）が付いている（Issue #377）", () => {
  const limbs = createBaseBodyParts("#e8934a")
    .filter((part) => part.limb)
    .map((part) => ({ limb: part.limb.kind, side: Math.sign(part.position.x) }));

  // 左右の足と左右の手の4つだけ。胴や頭が振れると体ごと崩れて見える
  assert.deepEqual(
    limbs.sort((a, b) => a.limb.localeCompare(b.limb) || a.side - b.side),
    [
      { limb: "foot", side: -1 },
      { limb: "foot", side: 1 },
      { limb: "hand", side: -1 },
      { limb: "hand", side: 1 },
    ],
  );
});

test("選べるキャラクターはすべて、色の枠を skin と accent だけで使う（枠の意味を揃える）", () => {
  for (const type of CHARACTER_TYPES) {
    const slots = new Set(
      getBuildingParts(CHARACTER_TYPE_ASSET_IDS[type])
        .map((part) => part.paletteSlot)
        .filter(Boolean),
    );
    assert.deepEqual([...slots].sort(), ["accent", "skin"], `${type} の色の枠が揃っていない`);
  }
});

test("かえる以外は、顔・頭の着せ替え品を同じ位置に付ける", () => {
  const others = CHARACTER_TYPES.filter((type) => type !== "frog");
  const [first, ...rest] = others.map((type) => CHARACTER_TYPE_ASSET_IDS[type]);
  for (const assetId of rest) {
    for (const slot of ["face", "head"]) {
      assert.deepEqual(getSlotAnchor(assetId, slot), getSlotAnchor(first, slot), `${assetId} の ${slot}`);
    }
  }
});
