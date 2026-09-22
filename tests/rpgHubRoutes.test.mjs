import assert from "node:assert/strict";
import test from "node:test";
import { MAP_ROUTES_BY_ROLE, resolveMapRoute } from "../lib/rpg-hub/routes.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";

test("大人はタスク・ストアの建物から大人用画面へ行く", () => {
  assert.equal(resolveMapRoute("tasks", "parent"), "/tasks-adult");
  assert.equal(resolveMapRoute("store", "parent"), "/store-adult");
});

test("子供の行き先はこれまでどおり子供用画面", () => {
  assert.equal(resolveMapRoute("tasks", "child"), "/tasks-child");
  assert.equal(resolveMapRoute("store", "child"), "/store-child");
});

test("銀行と履歴は大人・子供で同じ画面（ロールは中で見ている）", () => {
  assert.equal(resolveMapRoute("bank", "parent"), resolveMapRoute("bank", "child"));
  assert.equal(resolveMapRoute("history", "parent"), resolveMapRoute("history", "child"));
});

test("ロールが未確定のときは子供用へ寄せる（RPGハブは子供のホーム）", () => {
  assert.equal(resolveMapRoute("tasks", undefined), "/tasks-child");
});

test("町に建っている建物の行き先が、どちらのロールでも決まっている", () => {
  // 建物を1棟増やして表の片側を埋め忘れると、その建物に入ったときだけ
  // undefined へ遷移する。町の定数と表を突き合わせて防ぐ。
  const routeIds = INITIAL_MAP_OBJECTS.filter((object) => object.type === "building").map(
    (object) => object.route,
  );
  assert.ok(routeIds.length > 0, "建物が1つも無いのはおかしい");

  for (const routeId of routeIds) {
    for (const role of ["parent", "child"]) {
      assert.equal(
        typeof MAP_ROUTES_BY_ROLE[role][routeId],
        "string",
        `${role} の ${routeId} の行き先が決まっていません`,
      );
    }
  }
});
