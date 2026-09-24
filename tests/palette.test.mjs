import assert from "node:assert/strict";
import test from "node:test";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { getBuildingParts } from "../lib/rpg-hub/catalog.ts";
import { parsePalette, pickValidPalette, resolvePartColor } from "../lib/rpg-hub/palette.ts";

const slotted = { color: "#111111", paletteSlot: "skin" };
const fixed = { color: "#222222" };

test("差し替え枠があるパーツは、同じ枠の色で描く", () => {
  assert.equal(resolvePartColor(slotted, { skin: "#abcdef" }), "#abcdef");
});

test("差し替え指定が無い・同じ枠の色が無いときは、パーツの色のまま", () => {
  assert.equal(resolvePartColor(slotted, undefined), "#111111");
  assert.equal(resolvePartColor(slotted, {}), "#111111");
  assert.equal(resolvePartColor(slotted, { accent: "#abcdef" }), "#111111");
});

test("差し替え枠の無いパーツは、指定があっても色を変えない", () => {
  assert.equal(resolvePartColor(fixed, { accent: "#abcdef", hair: "#abcdef", skin: "#abcdef" }), "#222222");
});

test("parsePalette は不正な枠・色が1つでもあれば全体を拒否する", () => {
  assert.deepEqual(parsePalette({ skin: "#ABCDEF" }), { skin: "#ABCDEF" });
  assert.equal(parsePalette({ skin: "#abcdef", unknown: "#abcdef" }), null);
  assert.equal(parsePalette({ skin: "#abc" }), null);
  assert.equal(parsePalette(["#abcdef"]), null);
});

test("pickValidPalette は正しい枠だけを残し、ほかは落とす", () => {
  assert.deepEqual(
    pickValidPalette({ accent: "red", hair: 1, skin: "#abcdef", unknown: "#abcdef" }),
    { skin: "#abcdef" },
  );
  assert.deepEqual(pickValidPalette({}), {});
  assert.equal(pickValidPalette(null), null);
  assert.equal(pickValidPalette("#abcdef"), null);
});

// --- プレイヤー（カエル）の差し替え枠（Issue #254） ---

const playerParts = getBuildingParts(RPG_HUB_ASSETS.player);

test("見た目の指定が無ければ、プレイヤーは今までどおりの色で描かれる", () => {
  // 枠を付けたことで既定の見た目が変わっていないこと
  for (const part of playerParts) {
    assert.equal(resolvePartColor(part, {}), part.color);
  }
});

test("プレイヤーは skin と accent で色が変わり、顔（のど・白目・瞳）の色は変わらない", () => {
  const palette = { accent: "#123456", hair: "#654321", skin: "#abcdef" };
  const colors = playerParts.map((part) => resolvePartColor(part, palette));

  assert.ok(colors.includes("#abcdef"), "skin が効くパーツがある");
  assert.ok(colors.includes("#123456"), "accent が効くパーツがある");
  // カエルには髪が無い
  assert.ok(!colors.includes("#654321"), "hair はどのパーツにも効かない");
  // 顔の見分けに要る色は固定のまま
  for (const faceColor of ["#f7e9c4", "#fdfdf6", "#1e2b1a"]) {
    assert.ok(colors.includes(faceColor), `${faceColor} は固定のまま`);
  }
  // 緑は残らず差し替わる（塗り残しがあると、選んだ色の中に緑が混ざる）
  assert.ok(!colors.includes("#4fae3f"));
  assert.ok(!colors.includes("#2f7a2a"));
});
