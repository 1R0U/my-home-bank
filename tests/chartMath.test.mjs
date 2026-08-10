import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPageIndex,
  getBarHeight,
  getPageIndexFromScrollOffset,
  getPageScrollOffset,
  getResyncScrollTarget,
} from "../components/history/chartMath.ts";

test("値が0の場合、棒の高さは0になる", () => {
  assert.equal(getBarHeight(0, 100, 120), 0);
});

test("値が正の場合、割合に応じた高さになり最小2pxを下回らない", () => {
  assert.equal(getBarHeight(50, 100, 120), 60);
  assert.equal(getBarHeight(1, 1000, 120), 2);
});

test("maxValueが0以下の場合はInfinityにならず高さ0を返す", () => {
  assert.equal(getBarHeight(5, 0, 120), 0);
  assert.equal(getBarHeight(5, -10, 120), 0);
});

test("ページインデックスは範囲内にクランプされる", () => {
  assert.equal(clampPageIndex(-1, 2), 0);
  assert.equal(clampPageIndex(5, 2), 1);
  assert.equal(clampPageIndex(1, 2), 1);
});

test("ページ番号とページ幅からスクロール位置を計算できる", () => {
  assert.equal(getPageScrollOffset(0, 300), 0);
  assert.equal(getPageScrollOffset(1, 300), 300);
});

test("スクロール位置からページ番号を計算できる（幅が変わっても選択中ページを維持できる）", () => {
  // 幅300pxでページ1(x=300)を選択中に、幅が360pxへ変わっても
  // 再計算後のオフセット(360)から同じページ1が求まること
  assert.equal(getPageIndexFromScrollOffset(300, 300, 2), 1);
  assert.equal(getPageIndexFromScrollOffset(360, 360, 2), 1);
});

test("スクロール位置が範囲外でもページ番号はクランプされる", () => {
  assert.equal(getPageIndexFromScrollOffset(-50, 300, 2), 0);
  assert.equal(getPageIndexFromScrollOffset(900, 300, 2), 1);
});

test("幅が確定していれば選択中ページの位置へ再同期する", () => {
  assert.equal(getResyncScrollTarget(300, 0, false), 0);
  assert.equal(getResyncScrollTarget(300, 1, false), 300);
});

test("幅が未確定(0)、またはドラッグ中は再同期しない", () => {
  assert.equal(getResyncScrollTarget(0, 1, false), null);
  assert.equal(getResyncScrollTarget(300, 1, true), null);
});
