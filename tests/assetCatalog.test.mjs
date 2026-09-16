import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATALOG, ASSET_DEFINITIONS, getBuildingParts } from "../lib/rpg-hub/catalog.ts";
import { NO_SHADOW_ASSETS, RPG_HUB_ASSETS, resolveAssetId } from "../lib/rpg-hub/assets.ts";

/**
 * カタログ（lib/rpg-hub/catalog.ts）の不変条件（Issue #220）。
 *
 * アセットを1つ増やすときに編集するのはカタログだけ、という前提を守るためのテスト。
 * **エントリの書き方を間違えたら、ここで落ちる。**
 */

// --- IDの決まり ---

test("IDは重複しない", () => {
  // 重複すると、後から定義したほうが前のものを上書きして静かに消える
  const ids = ASSET_DEFINITIONS.map((definition) => definition.id);

  assert.equal(new Set(ids).size, ids.length, "同じIDのエントリがある");
});

test("IDは種別に応じた接頭辞で始まる", () => {
  // 外部から来た値を見ただけで何のアセットか分かるようにしている
  const prefixes = {
    building: "building-",
    character: ["character-", "player-"],
    decoration: "decoration-",
  };

  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    const expected = prefixes[definition.category];
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert.ok(
      allowed.some((prefix) => definition.id.startsWith(prefix)),
      `${key} のID "${definition.id}" が ${allowed.join(" / ")} で始まっていない`,
    );
  }
});

test("IDは小文字とハイフンだけで書く", () => {
  for (const definition of ASSET_DEFINITIONS) {
    assert.match(definition.id, /^[a-z]+(-[a-z]+)*$/, `${definition.id} の表記がそろっていない`);
  }
});

// --- 形 ---

test("すべてのエントリが形を持っている", () => {
  // 空だと画面から消える。しかも例外にならないので気づきにくい
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    assert.ok(definition.parts.length > 0, `${key} に形がない`);
  }
});

test("カタログにあるIDは、必ずそのエントリの形を返す", () => {
  // 登録漏れがあるとフォールバックの箱が出る。それを検出する
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    assert.equal(
      getBuildingParts(definition.id),
      definition.parts,
      `${key} がカタログの形を返していない（フォールバックに落ちている可能性）`,
    );
  }
});

test("未知のIDでもフォールバックの形を返す（描画を消さない）", () => {
  const parts = getBuildingParts("decoration-nonexistent");

  assert.ok(Array.isArray(parts) && parts.length > 0);
});

// --- 派生する表がそろっている ---

test("RPG_HUB_ASSETS はカタログと過不足なく一致する", () => {
  assert.deepEqual(
    Object.keys(RPG_HUB_ASSETS).sort(),
    Object.keys(ASSET_CATALOG).sort(),
    "カタログに足したのに RPG_HUB_ASSETS へ出てきていない（またはその逆）",
  );

  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    assert.equal(RPG_HUB_ASSETS[key], definition.id);
  }
});

test("NO_SHADOW_ASSETS は castsShadow: false のものと一致する", () => {
  // 以前は手で管理しており、足し忘れると静かに影のパスだけが重くなっていた
  const expected = ASSET_DEFINITIONS.filter((definition) => definition.castsShadow === false).map(
    (definition) => definition.id,
  );

  assert.deepEqual([...NO_SHADOW_ASSETS].sort(), expected.sort());
});

test("カタログにあるIDはすべて resolveAssetId を通る", () => {
  for (const definition of ASSET_DEFINITIONS) {
    assert.equal(resolveAssetId(definition.id), definition.id, `${definition.id} が弾かれている`);
  }
});

test("カタログに無いIDは resolveAssetId が弾く", () => {
  for (const value of ["decoration-nonexistent", "", "../etc/passwd", 42, null, undefined, {}]) {
    assert.equal(resolveAssetId(value), null, `${JSON.stringify(value)} を通してしまっている`);
  }
});

// --- 装飾として置くときの寸法 ---

test("装飾の当たり判定は正方形で、正の大きさを持つ", () => {
  // isBlocked は rotationY を反映しない（#198）。正方形なら回転させてもずれない
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (!definition.placement) continue;
    assert.ok(definition.placement.size > 0, `${key} の size が正でない`);
    assert.ok(definition.placement.halfHeight >= 0, `${key} の halfHeight が負`);
  }
});

test("placement を持つのは装飾だけ", () => {
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (!definition.placement) continue;
    assert.equal(definition.category, "decoration", `${key} は装飾ではないのに placement を持つ`);
  }
});

test("踏んで歩けるものは影を落とさない", () => {
  // 草むらと道。細すぎる／貼りついているため、影を出すと見た目が悪く負荷だけ増える
  for (const [key, definition] of Object.entries(ASSET_CATALOG)) {
    if (definition.placement?.solid !== false) continue;
    assert.equal(definition.castsShadow, false, `${key} は踏めるのに影を落としている`);
  }
});
