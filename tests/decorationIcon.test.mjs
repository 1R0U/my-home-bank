import assert from "node:assert/strict";
import test from "node:test";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { getDecorationIconKind } from "../lib/rpg-hub/decorationIcon.ts";

test("置ける装飾は、どれもかざるメニューの絵を持つ", () => {
  // 新しい装飾を足したのに絵の対応を足し忘れると、メニューに名前だけが出る
  for (const assetId of getPlaceableDecorations()) {
    assert.notEqual(getDecorationIconKind(assetId), null, `${assetId} に絵が無い`);
  }
});

test("派生した装飾は、元と同じ種類の絵になる", () => {
  assert.equal(getDecorationIconKind("decoration-tree"), "tree");
  assert.equal(getDecorationIconKind("decoration-tree-pine"), "tree");
  assert.equal(getDecorationIconKind("decoration-bush-berry"), "bush");
  assert.equal(getDecorationIconKind("decoration-rock-pile"), "rock");
});

test("頭が似ているだけの別のIDは当てない", () => {
  assert.equal(getDecorationIconKind("decoration-treehouse"), null);
  assert.equal(getDecorationIconKind("decoration-path"), null);
});
