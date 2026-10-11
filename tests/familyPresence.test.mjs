import assert from "node:assert/strict";
import test from "node:test";
import { FAMILY_PRESENCE_COLORS, assignFamilyPresenceColors } from "../lib/rpg-hub/familyPresence.ts";

test("assignFamilyPresenceColors: 並び順（id昇順）に沿って配色から順に割り当てる", () => {
  const colors = assignFamilyPresenceColors(["b-id", "a-id", "c-id"]);
  assert.deepEqual(colors, {
    "a-id": FAMILY_PRESENCE_COLORS[0],
    "b-id": FAMILY_PRESENCE_COLORS[1],
    "c-id": FAMILY_PRESENCE_COLORS[2],
  });
});

test("assignFamilyPresenceColors: 取得順が変わっても、同じメンバーには同じ色が付く", () => {
  const first = assignFamilyPresenceColors(["id-1", "id-2", "id-3"]);
  const second = assignFamilyPresenceColors(["id-3", "id-1", "id-2"]);
  assert.deepEqual(first, second);
});

test("assignFamilyPresenceColors: 人数が配色の数を超えたら、配色を繰り越す（循環する）", () => {
  const ids = Array.from({ length: FAMILY_PRESENCE_COLORS.length + 2 }, (_, i) => `id-${i}`).sort();
  const colors = assignFamilyPresenceColors(ids);
  assert.equal(colors[ids[0]], FAMILY_PRESENCE_COLORS[0]);
  assert.equal(colors[ids[FAMILY_PRESENCE_COLORS.length]], FAMILY_PRESENCE_COLORS[0]);
  assert.equal(colors[ids[FAMILY_PRESENCE_COLORS.length + 1]], FAMILY_PRESENCE_COLORS[1]);
});

test("assignFamilyPresenceColors: 元の配列を変更しない", () => {
  const ids = ["b-id", "a-id"];
  assignFamilyPresenceColors(ids);
  assert.deepEqual(ids, ["b-id", "a-id"]);
});

test("assignFamilyPresenceColors: 空の一覧には何も割り当てない", () => {
  assert.deepEqual(assignFamilyPresenceColors([]), {});
});
