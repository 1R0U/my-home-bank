import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATALOG } from "../lib/rpg-hub/catalog.ts";
import {
  SEASON_COLORS,
  SEASON_LIGHTING,
  SEASON_PARTICLES,
  SEASON_TINTS,
  SUN_DIRECTION,
  mixColor,
  resolveSeasonalColor,
} from "../lib/rpg-hub/seasonalLook.ts";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const SLOTS = ["blossom", "foliage", "grass", "needle", "roof"];
const COLOR = /^#[0-9a-f]{6}$/i;

/** #rrggbb を 0〜1 の3成分にする。 */
const channels = (hex) =>
  [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);

// --- 色を混ぜる ---

test("mixColor は割合に応じて2色を混ぜる", () => {
  assert.equal(mixColor("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixColor("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixColor("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixColor("#ff0000", "#0000ff", 0.25), "#bf0040");
});

test("mixColor は割合を 0〜1 に収める", () => {
  assert.equal(mixColor("#102030", "#ffffff", -1), "#102030");
  assert.equal(mixColor("#102030", "#ffffff", 2), "#ffffff");
});

// --- 部品の色 ---

test("夏はどの部品も元の色のまま", () => {
  for (const slot of SLOTS) {
    assert.equal(resolveSeasonalColor("#2f7a4e", slot, "summer"), "#2f7a4e");
  }
});

test("季節の種類を持たない部品は、どの季節でも元の色のまま", () => {
  for (const season of SEASONS) {
    assert.equal(resolveSeasonalColor("#dbeafe", undefined, season), "#dbeafe");
  }
});

test("秋は広葉樹の葉が赤く、ほかの木の葉が橙に寄る", () => {
  const [blossomR, blossomG] = channels(resolveSeasonalColor("#2f7a4e", "blossom", "autumn"));
  const [foliageR, foliageG] = channels(resolveSeasonalColor("#2f7a4e", "foliage", "autumn"));
  // 緑より赤が強くなっている
  assert.ok(blossomR > blossomG);
  assert.ok(foliageR > foliageG);
  // 赤（紅葉）のほうが、橙（黄葉）より緑が少ない
  assert.ok(blossomG < foliageG);
});

test("春は広葉樹「き」が桜色になる", () => {
  const [r, g, b] = channels(resolveSeasonalColor("#2f7a4e", "blossom", "spring"));
  assert.ok(r > g && b > g, "赤と青が緑より強い（桃色）");
});

test("冬は雪をかぶって明るくなる。針葉樹と屋根は元の色が分かる程度にとどめる", () => {
  const brightness = (hex) => channels(hex).reduce((sum, value) => sum + value, 0);
  for (const slot of SLOTS) {
    assert.ok(
      brightness(resolveSeasonalColor("#2a6b46", slot, "winter")) > brightness("#2a6b46"),
      slot,
    );
  }
  assert.ok(SEASON_TINTS.winter.needle.amount < SEASON_TINTS.winter.foliage.amount);
  assert.ok(SEASON_TINTS.winter.roof.amount <= 0.5);
});

test("冬に雪をかぶっても、4棟の屋根の色は見分けがつく", () => {
  // 屋根の色は建物の見分けに使っている（buildingParts.ts）
  const roofs = ["bank", "store", "tasks", "history"].map((key) =>
    ASSET_CATALOG[key].parts.find((part) => part.seasonSlot === "roof"),
  );
  assert.ok(roofs.every(Boolean), "4棟とも屋根に季節の種類が付いている");
  const winterRoofs = roofs.map((part) => resolveSeasonalColor(part.color, "roof", "winter"));
  for (let i = 0; i < winterRoofs.length; i += 1) {
    for (let j = i + 1; j < winterRoofs.length; j += 1) {
      const a = channels(winterRoofs[i]);
      const b = channels(winterRoofs[j]);
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(distance > 0.1, `${winterRoofs[i]} と ${winterRoofs[j]} が近すぎる`);
    }
  }
});

test("季節の色の指定は、すべて正しい色と 0〜1 の割合", () => {
  for (const season of SEASONS) {
    for (const [slot, tint] of Object.entries(SEASON_TINTS[season])) {
      assert.ok(SLOTS.includes(slot), slot);
      assert.match(tint.color, COLOR);
      assert.ok(tint.amount > 0 && tint.amount <= 1, `${season}/${slot}`);
    }
  }
});

test("木・低木・草むらは、どれも季節で色が変わる部品を持つ", () => {
  const nature = Object.entries(ASSET_CATALOG).filter(([key]) => /^(tree|bush|grass)/.test(key));
  assert.ok(nature.length >= 12);
  for (const [key, definition] of nature) {
    assert.ok(
      definition.parts.some((part) => part.seasonSlot !== undefined),
      `${key} に季節の種類が付いた部品がない`,
    );
  }
});

test("幹・実・花・岩は季節で色を変えない", () => {
  // 季節の種類は葉と屋根だけに付ける。幹まで紅葉すると木に見えなくなる
  const trunk = ASSET_CATALOG.tree.parts.find((part) => part.shape === "cylinder");
  assert.equal(trunk.seasonSlot, undefined);
  for (const key of ["rock", "rockFlat", "rockPile", "rockTall", "flowerbed", "path"]) {
    assert.ok(ASSET_CATALOG[key].parts.every((part) => part.seasonSlot === undefined), key);
  }
  const berries = ASSET_CATALOG.bushBerry.parts.filter((part) => part.shape === "box");
  assert.ok(berries.length > 0 && berries.every((part) => part.seasonSlot === undefined));
});

// --- 照明 ---

test("どの季節も、上を向いた面の明るさが 1.0 を超えない（白飛びしない／Issue #214）", () => {
  const length = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  // 上向きの面（法線 0,1,0）に太陽が当たる割合
  const sunOnTop = -SUN_DIRECTION.y / length;
  for (const season of SEASONS) {
    const { ambient, sun } = SEASON_LIGHTING[season];
    const ambientColor = channels(ambient.color);
    const sunColor = channels(sun.color);
    for (let channel = 0; channel < 3; channel += 1) {
      const top =
        ambient.intensity * ambientColor[channel] + sun.intensity * sunColor[channel] * sunOnTop;
      assert.ok(top <= 1, `${season} の成分${channel}が ${top.toFixed(3)}`);
    }
  }
});

test("照明が暗くなりすぎない（上を向いた面が 0.85 以上）", () => {
  const length = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  const sunOnTop = -SUN_DIRECTION.y / length;
  for (const season of SEASONS) {
    const { ambient, sun } = SEASON_LIGHTING[season];
    const brightest = Math.max(
      ...[0, 1, 2].map(
        (channel) =>
          ambient.intensity * channels(ambient.color)[channel] +
          sun.intensity * channels(sun.color)[channel] * sunOnTop,
      ),
    );
    assert.ok(brightest >= 0.85, `${season} が ${brightest.toFixed(3)}`);
  }
});

test("照明と地面・空の色は、すべての季節ぶん正しい色で揃っている", () => {
  for (const season of SEASONS) {
    const { ambient, sun } = SEASON_LIGHTING[season];
    for (const color of [ambient.color, ambient.groundColor, sun.color]) {
      assert.match(color, COLOR);
    }
    assert.match(SEASON_COLORS[season].ground, COLOR);
    assert.match(SEASON_COLORS[season].sky, COLOR);
  }
});

// --- 舞い落ちる物 ---

test("夏以外は空から何かが舞い落ち、夏は何も降らない", () => {
  assert.equal(SEASON_PARTICLES.summer, null);
  for (const season of ["spring", "autumn", "winter"]) {
    const particles = SEASON_PARTICLES[season];
    assert.ok(particles, season);
    assert.ok(particles.emitRate > 0 && particles.fallSpeed > 0 && particles.drift >= 0);
    assert.ok(particles.size.min > 0 && particles.size.min <= particles.size.max);
    particles.colors.forEach((color) => assert.match(color, COLOR));
  }
});
