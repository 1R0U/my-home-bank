import assert from "node:assert/strict";
import test from "node:test";
import { getBuildingParts, getPreviewParts } from "../lib/rpg-hub/catalog.ts";
import {
  applyHouseFinishes,
  FLOORINGS,
  findHouseFinish,
  getSelectableFinishes,
  HOUSE_FLOOR_OBJECT_ID,
  STARTER_HOUSE_FINISHES,
  WALLPAPERS,
} from "../lib/rpg-hub/houseFinishes.ts";
import { HOUSE_INTERIOR_OBJECTS } from "../lib/rpg-hub/houseInterior.ts";
import { fetchHouseFinishes, saveHouseFinishes, toHouseFinishes, toHouseInteriorSettingsRow } from "../lib/houseFinishService.ts";
import { STORE_ASSETS } from "../lib/storeAssets.ts";

/**
 * 家の中の壁紙・床板（Issue #480）。
 */

test("壁紙・床板は、最初の1つだけが家に付いていて、残りはストアで売る", () => {
  for (const finishes of [WALLPAPERS, FLOORINGS]) {
    assert.deepEqual(finishes.map((finish) => Boolean(finish.starter)), finishes.map((_, index) => index === 0));
  }
  const sold = new Set(STORE_ASSETS.map((asset) => asset.id));
  for (const finish of [...WALLPAPERS, ...FLOORINGS]) {
    assert.equal(sold.has(finish.id), !finish.starter, `${finish.id} の販売のしかたが違う`);
  }
});

test("IDの頭で、壁紙か床板かが分かる", () => {
  for (const finish of WALLPAPERS) assert.match(finish.id, /^wallpaper-/);
  for (const finish of FLOORINGS) assert.match(finish.id, /^flooring-/);
  assert.equal(findHouseFinish("wallpaper-brick")?.kind, "wallpaper");
  assert.equal(findHouseFinish("flooring-tatami")?.kind, "flooring");
  assert.equal(findHouseFinish("decoration-tree"), null);
});

test("どの壁紙・床板にも形があり、店の棚では見本の形を使う", () => {
  for (const finish of [...WALLPAPERS, ...FLOORINGS]) {
    assert.ok(getBuildingParts(finish.id).length > 0, `${finish.id} の形が無い`);
    assert.notEqual(getPreviewParts(finish.id), getBuildingParts(finish.id), `${finish.id} の見本が無い`);
  }
});

test("最初の壁紙・床板のままなら、部屋の見た目を変えない", () => {
  const result = applyHouseFinishes(HOUSE_INTERIOR_OBJECTS, STARTER_HOUSE_FINISHES);
  assert.deepEqual(result, [...HOUSE_INTERIOR_OBJECTS]);
});

test("選んだ壁紙は奥と左の壁すべてに、床板は床に使い、ほかの物は変えない", () => {
  const result = applyHouseFinishes(HOUSE_INTERIOR_OBJECTS, { flooringId: "flooring-tatami", wallpaperId: "wallpaper-brick" });
  const walls = result.filter((object) => /^house-wall-(back|left)-\d+$/.test(object.id));
  assert.ok(walls.length > 0);
  assert.ok(walls.every((wall) => wall.model === "wallpaper-brick"));
  assert.equal(result.find((object) => object.id === HOUSE_FLOOR_OBJECT_ID)?.model, "flooring-tatami");
  // 見えない壁（手前・右）や家具はそのまま
  result.forEach((object, index) => {
    if (walls.includes(object) || object.id === HOUSE_FLOOR_OBJECT_ID) return;
    assert.equal(object, HOUSE_INTERIOR_OBJECTS[index]);
  });
});

test("知らないIDや種類ちがいのIDは、最初の壁紙・床板にする", () => {
  const result = applyHouseFinishes(HOUSE_INTERIOR_OBJECTS, { flooringId: "wallpaper-brick", wallpaperId: "nope" });
  assert.deepEqual(result, [...HOUSE_INTERIOR_OBJECTS]);
});

test("選べるのは、家に付いている1つと、持っているものだけ（一覧の順）", () => {
  const owned = ["flooring-tatami", "wallpaper-flower", "decoration-tree", "wallpaper-wood"];
  assert.deepEqual(getSelectableFinishes("wallpaper", owned).map((finish) => finish.id), [
    "wallpaper-plaster",
    "wallpaper-wood",
    "wallpaper-flower",
  ]);
  assert.deepEqual(getSelectableFinishes("flooring", owned).map((finish) => finish.id), ["flooring-wood", "flooring-tatami"]);
  assert.deepEqual(getSelectableFinishes("flooring", []).map((finish) => finish.id), ["flooring-wood"]);
});

test("DBの NULL・行なし・知らないIDは、最初の壁紙・床板として読む", () => {
  assert.deepEqual(toHouseFinishes(null), STARTER_HOUSE_FINISHES);
  assert.deepEqual(toHouseFinishes({ flooring_id: null, wallpaper_id: null }), STARTER_HOUSE_FINISHES);
  assert.deepEqual(toHouseFinishes({ flooring_id: "flooring-unknown", wallpaper_id: "flooring-stone" }), STARTER_HOUSE_FINISHES);
  assert.deepEqual(toHouseFinishes({ flooring_id: "flooring-stone", wallpaper_id: "wallpaper-brick" }), {
    flooringId: "flooring-stone",
    wallpaperId: "wallpaper-brick",
  });
});

test("最初の壁紙・床板は NULL で書く（ストアの商品ではないため）", () => {
  assert.deepEqual(toHouseInteriorSettingsRow(STARTER_HOUSE_FINISHES), { flooring_id: null, wallpaper_id: null });
  assert.deepEqual(toHouseInteriorSettingsRow({ flooringId: "flooring-stone", wallpaperId: STARTER_HOUSE_FINISHES.wallpaperId }), {
    flooring_id: "flooring-stone",
    wallpaper_id: null,
  });
});

function makeFetchClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "house_interior_settings");
      return {
        select(columns) {
          assert.equal(columns, "wallpaper_id, flooring_id");
          return {
            eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              return { maybeSingle: async () => ({ data, error }) };
            },
          };
        },
      };
    },
  };
}

test("取得した行を、アプリで使う形にする。行が無ければ最初の壁紙・床板", async () => {
  const client = makeFetchClient({ data: { flooring_id: null, wallpaper_id: "wallpaper-wood" }, error: null });
  assert.deepEqual(await fetchHouseFinishes("user-1", client), {
    flooringId: STARTER_HOUSE_FINISHES.flooringId,
    wallpaperId: "wallpaper-wood",
  });
  assert.deepEqual(await fetchHouseFinishes("user-1", makeFetchClient({ data: null, error: null })), STARTER_HOUSE_FINISHES);
});

test("取得に失敗したらエラーを投げる", async () => {
  await assert.rejects(() => fetchHouseFinishes("user-1", makeFetchClient({ data: null, error: new Error("boom") })), /boom/);
});

test("保存は利用者ごとの1行を作るか書き換える", async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "house_interior_settings");
      return {
        async upsert(row, options) {
          calls.push({ options, row });
          return { error: null };
        },
      };
    },
  };
  await saveHouseFinishes("user-1", { flooringId: "flooring-stone", wallpaperId: STARTER_HOUSE_FINISHES.wallpaperId }, client);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { onConflict: "user_id" });
  const { updated_at: updatedAt, ...row } = calls[0].row;
  assert.equal(typeof updatedAt, "string");
  assert.deepEqual(row, { flooring_id: "flooring-stone", user_id: "user-1", wallpaper_id: null });
});

test("保存に失敗したらエラーを投げる", async () => {
  const client = { from: () => ({ upsert: async () => ({ error: new Error("この壁紙を持っていません") }) }) };
  await assert.rejects(() => saveHouseFinishes("user-1", STARTER_HOUSE_FINISHES, client), /持っていません/);
});
