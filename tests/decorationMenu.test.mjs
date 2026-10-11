import assert from "node:assert/strict";
import test from "node:test";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog.ts";
import { getDecorationIconKind, groupDecorations } from "../lib/rpg-hub/decorationMenu.ts";

test("置ける装飾は、どれもかざるメニューの種類を持つ", () => {
  // 新しい装飾を足したのに種類の対応を足し忘れると、メニューに出なくなる
  for (const assetId of getPlaceableDecorations()) {
    assert.notEqual(getDecorationIconKind(assetId), null, `${assetId} の種類が無い`);
  }
});

test("派生した装飾は、元と同じ種類になる", () => {
  assert.equal(getDecorationIconKind("decoration-tree"), "tree");
  assert.equal(getDecorationIconKind("decoration-tree-pine"), "tree");
  assert.equal(getDecorationIconKind("decoration-bush-berry"), "bush");
  assert.equal(getDecorationIconKind("decoration-rock-pile"), "rock");
});

test("頭が似ているだけの別のIDは当てない", () => {
  assert.equal(getDecorationIconKind("decoration-treehouse"), null);
  assert.equal(getDecorationIconKind("decoration-path"), null);
});

test("種類ごとにまとめ、種類も中身も元の並び順を保つ", () => {
  const groups = groupDecorations([
    "decoration-bush",
    "decoration-tree",
    "decoration-bush-berry",
    "decoration-lamp",
    "decoration-tree-pine",
  ]);

  assert.deepEqual(
    groups.map((group) => [group.kind, group.label, group.assetIds]),
    [
      ["bush", "しげみ", ["decoration-bush", "decoration-bush-berry"]],
      ["tree", "き", ["decoration-tree", "decoration-tree-pine"]],
      ["lamp", "ランプ", ["decoration-lamp"]],
    ],
  );
});

test("置ける装飾をまとめても、1つも落とさない", () => {
  const placeable = getPlaceableDecorations();
  const grouped = groupDecorations(placeable).flatMap((group) => group.assetIds);

  assert.deepEqual([...grouped].sort(), [...placeable].sort());
});
