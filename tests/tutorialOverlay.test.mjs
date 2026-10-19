import assert from "node:assert/strict";
import test from "node:test";
import { clipTutorialTarget, getTutorialOverlayLayout, getTutorialNavigationPath } from "../lib/tutorialOverlay.ts";

const viewport = { width: 390, height: 844, top: 44, bottom: 34 };

test("上側のボタンは下、下側のボタンは上に説明を置き、対象を覆わない", () => {
  for (const target of [{ x: 20, y: 70, width: 100, height: 50 }, { x: 180, y: 740, width: 180, height: 50 }]) {
    const result = getTutorialOverlayLayout(viewport, target, 240);
    const panel = result.panel;
    assert.ok(panel.left >= 0 && panel.left + panel.width <= viewport.width);
    assert.ok(panel.top >= viewport.top && panel.top + Math.min(240, panel.maxHeight) <= viewport.height - viewport.bottom);
    assert.ok(panel.top >= target.y + target.height || panel.top + Math.min(240, panel.maxHeight) <= target.y);
    assert.equal(result.shades.reduce((sum, shade) => sum + shade.width * shade.height, 0), viewport.width * viewport.height - target.width * target.height);
    for (const shade of result.shades) assert.ok(shade.width >= 0 && shade.height >= 0);
  }
});

test("対象のない説明は中央に置き、小さい画面でも本文をスクロールできる高さに制限する", () => {
  const normal = getTutorialOverlayLayout(viewport, null, 240);
  assert.equal(normal.highlight, null);
  assert.equal(normal.shades.length, 1);
  assert.equal(normal.panel.left + normal.panel.width / 2, viewport.width / 2);
  const small = getTutorialOverlayLayout({ width: 280, height: 300, top: 30, bottom: 20 }, null, 500);
  assert.ok(small.panel.top >= 30);
  assert.ok(small.panel.top + small.panel.maxHeight <= 280);
});

test("スクロール・回転で画面外へ動いた対象や未計測の値を、強調範囲へ混ぜない", () => {
  assert.equal(clipTutorialTarget({ x: 10, y: 900, width: 100, height: 40 }, 390, 844), null);
  assert.equal(clipTutorialTarget({ x: NaN, y: 10, width: 100, height: 40 }, 390, 844), null);
  assert.equal(clipTutorialTarget({ x: 10, y: 10, width: 0, height: 40 }, 390, 844), null);
  assert.deepEqual(clipTutorialTarget({ x: -10, y: 20, width: 50, height: 40 }, 390, 844), { x: 0, y: 20, width: 40, height: 40 });
});

test("移動許可の照合はグループ内の実際の画面まで解決し、通常の戻る操作には移動先を与えない", () => {
  assert.equal(getTutorialNavigationPath({ type: "GO_BACK" }), null);
  assert.equal(getTutorialNavigationPath({ type: "POP_TO", payload: { name: "(adult)", params: { screen: "main-adult" } } }), "/main-adult");
  assert.equal(getTutorialNavigationPath({ type: "REPLACE", payload: { name: "settings-adult" } }), "/settings-adult");
  assert.equal(getTutorialNavigationPath({ type: "RESET", payload: { index: 0, routes: [{ name: "rpg-hub" }] } }), "/rpg-hub");
});
