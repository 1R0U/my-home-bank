import assert from "node:assert/strict";
import test from "node:test";
import { CHILD_THEME } from "../components/childTheme.ts";

/**
 * まとめる前に、2つのスタイルシートへ直接書かれていた値。
 * Issue #217 はこの色を**変えない**ための作業なので、値をここで固定する。
 * 見た目を変えたいときは、意図的にこのテストごと変える。
 */
const ORIGINAL = {
  brightYellow: "#f2c94c",
  darkWood: "#402416",
  fadedBeige: "#c2aa80",
  gold: "#d6b66a",
  paleYellow: "#fff0a6",
  parchment: "#fff8de",
  shadow: "#000000",
};

test("まとめる前と同じ色である", () => {
  assert.deepEqual({ ...CHILD_THEME }, ORIGINAL);
});

test("色は6桁のhex表記で書く", () => {
  for (const [name, value] of Object.entries(CHILD_THEME)) {
    assert.match(value, /^#[0-9a-f]{6}$/, `${name} の表記がそろっていない: ${value}`);
  }
});
