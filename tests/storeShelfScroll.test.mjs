import assert from "node:assert/strict";
import test from "node:test";
import {
  SCROLL_DRAG_THRESHOLD_PX,
  getMaxScroll,
  getNextScroll,
  getScrollbarMetrics,
  isTapWithinThreshold,
  isVerticalScrollGesture,
} from "../lib/storeShelfScroll.ts";

test("getMaxScroll: 表示段数以内ならスクロール量は0", () => {
  assert.equal(getMaxScroll(2, 2, 1.3), 0);
  assert.equal(getMaxScroll(1, 2, 1.3), 0);
});

test("getMaxScroll: 表示段数を超えたぶんだけスクロールできる", () => {
  assert.equal(getMaxScroll(3, 2, 1.3), 1.3);
  assert.equal(Number(getMaxScroll(5, 2, 1.3).toFixed(2)), 3.9);
});

test("isVerticalScrollGesture: スクロール不可(maxScroll=0)なら常にfalse", () => {
  assert.equal(isVerticalScrollGesture(0, 40, 0), false);
});

test("isVerticalScrollGesture: 縦の動きが横より大きくしきい値以上ならtrue", () => {
  assert.equal(isVerticalScrollGesture(2, 20, 1.3), true);
  assert.equal(isVerticalScrollGesture(-1, -10, 1.3), true);
});

test("isVerticalScrollGesture: 横の動きの方が大きいならfalse", () => {
  assert.equal(isVerticalScrollGesture(30, 10, 1.3), false);
});

test("isVerticalScrollGesture: 6px境界（5pxはfalse、6pxはtrue）", () => {
  assert.equal(SCROLL_DRAG_THRESHOLD_PX, 6);
  assert.equal(isVerticalScrollGesture(0, 5, 1.3), false);
  assert.equal(isVerticalScrollGesture(0, 6, 1.3), true);
  assert.equal(isVerticalScrollGesture(0, -6, 1.3), true);
});

test("getNextScroll: 指を上へ動かす(dyが負)と下の段が見える向きにスクロールする", () => {
  // dragToWorld=0.01, dy=-50 -> 0 - (-50 * 0.01) = 0.5
  assert.equal(getNextScroll(0, -50, 0.01, 1.3), 0.5);
});

test("getNextScroll: 上端でクランプ（0より小さくならない）", () => {
  assert.equal(getNextScroll(0, 100, 0.01, 1.3), 0);
  assert.equal(getNextScroll(0.3, 100, 0.01, 1.3), 0);
});

test("getNextScroll: 下端でクランプ（maxScrollを超えない）", () => {
  assert.equal(getNextScroll(1.0, -100, 0.01, 1.3), 1.3);
  assert.equal(getNextScroll(1.3, -1, 0.01, 1.3), 1.3);
});

test("getScrollbarMetrics: つまみの高さ割合は表示段数/全段数（下限0.2）", () => {
  const { thumbFraction } = getScrollbarMetrics(0, 1.3, 2, 4);
  assert.equal(thumbFraction, 0.5);
  const many = getScrollbarMetrics(0, 10, 2, 20);
  assert.equal(many.thumbFraction, 0.2); // 2/20=0.1 だが下限0.2
});

test("getScrollbarMetrics: つまみ位置はスクロール進捗に連動し、最大でも1-thumbFraction", () => {
  const top = getScrollbarMetrics(0, 1.3, 2, 3);
  assert.equal(top.thumbTopFraction, 0);
  const bottom = getScrollbarMetrics(1.3, 1.3, 2, 3);
  // thumbFraction = 2/3, progress=1 -> 1 * (1 - 2/3)
  assert.equal(Number(bottom.thumbTopFraction.toFixed(4)), Number((1 / 3).toFixed(4)));
});

test("getScrollbarMetrics: maxScroll=0なら位置は0", () => {
  assert.equal(getScrollbarMetrics(0, 0, 2, 2).thumbTopFraction, 0);
});

test("isTapWithinThreshold: 6px未満の動きはタップ、6px以上はドラッグ", () => {
  assert.equal(isTapWithinThreshold({ x: 0, y: 0 }, { x: 3, y: 3 }), true); // 約4.24px
  assert.equal(isTapWithinThreshold({ x: 0, y: 0 }, { x: 6, y: 0 }), false);
  assert.equal(isTapWithinThreshold({ x: 10, y: 10 }, { x: 40, y: 12 }), false);
});

test("isTapWithinThreshold: 座標が不明ならタップ扱い", () => {
  assert.equal(isTapWithinThreshold(null, { x: 100, y: 100 }), true);
  assert.equal(isTapWithinThreshold({ x: 0, y: 0 }, null), true);
});
