import assert from "node:assert/strict";
import test from "node:test";
import {
  GOL_NAME,
  GOL_UNIT,
  formatAmount,
  formatGol,
  formatGolForSpeech,
} from "../lib/amount.ts";

test("桁区切りを入れる", () => {
  assert.equal(formatAmount(1000), "1,000");
  assert.equal(formatAmount(1234567), "1,234,567");
});

test("4桁未満はそのまま", () => {
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(50), "50");
  assert.equal(formatAmount(999), "999");
});

test("負の額も扱える（履歴の支出など）", () => {
  assert.equal(formatAmount(-1500), "-1,500");
});

test("画面表示をgol単位に統一する", () => {
  assert.equal(GOL_UNIT, "gol");
  assert.equal(formatGol(1000), "1,000 gol");
  assert.equal(formatGol(-1500), "-1,500 gol");
});

test("日本語の文章と読み上げではゴルと表記する", () => {
  assert.equal(GOL_NAME, "ゴル");
  assert.equal(formatGolForSpeech(1000), "1,000ゴル");
});
