import assert from "node:assert/strict";
import test from "node:test";
import {
  getInteractLabel,
  MAP_ROUTES_BY_ROLE,
  resolveMapRoute,
  TELEPORT_DESTINATIONS,
  TELEPORT_ROUTES,
} from "../lib/rpg-hub/routes.ts";
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

test("掲示板は大人・子供とも、お知らせの一覧を開く（Issue #354）", () => {
  assert.equal(resolveMapRoute("board", "parent"), "/notifications");
  assert.equal(resolveMapRoute("board", "child"), "/notifications");
});

test("町の広場に掲示板が建っている（Issue #354）", () => {
  const boards = INITIAL_MAP_OBJECTS.filter(
    (object) => object.type === "building" && object.route === "board",
  );
  assert.equal(boards.length, 1);
});

test("ロールが未確定のときは子供用へ寄せる（RPGハブは子供のホーム）", () => {
  assert.equal(resolveMapRoute("tasks", undefined), "/tasks-child");
});

test("自分の家の出入りは、画面遷移ではなくテレポートで行う（Issue #444）", () => {
  for (const route of ["house", "exit"]) {
    assert.equal(TELEPORT_ROUTES.has(route), true, `${route} がテレポートになっていない`);
  }
  // きがえ（クローゼット）は家の中にあるが、きがえの画面へ遷移する
  assert.equal(TELEPORT_ROUTES.has("wardrobe"), false);
  assert.equal(resolveMapRoute("wardrobe", "child"), "/wardrobe");
});

test("テレポートの行き先は対になっていて、行って戻ると元の建物の前に着く", () => {
  // 町の家 ⇔ 家の中の玄関。片方だけ書き換えると、戻れなくなる
  assert.equal(TELEPORT_DESTINATIONS.house, "exit");
  for (const [from, to] of Object.entries(TELEPORT_DESTINATIONS)) {
    assert.equal(TELEPORT_DESTINATIONS[to], from, `${from} → ${to} の帰り道がない`);
  }
});

test("テレポートの行き先の建物は、マップに1つずつある", () => {
  // 行き先の建物が無いと、テレポートしても何も起きず、同じ route が2つあると行き先が決まらない
  for (const destination of Object.values(TELEPORT_DESTINATIONS)) {
    const buildings = INITIAL_MAP_OBJECTS.filter(
      (object) => object.type === "building" && object.route === destination,
    );
    assert.equal(buildings.length, 1, `${destination} の建物が ${buildings.length} 個ある`);
  }
});

test("建物に近づいたときのボタンは、行き先に合わせた言葉になる", () => {
  assert.equal(getInteractLabel("bank"), "{入|はい}る");
  assert.equal(getInteractLabel("house"), "{入|はい}る");
  assert.equal(getInteractLabel("board"), "{見|み}る");
  // 家の中の家具は、押すと何が起きるかが分かる言葉（Issue #444）
  assert.equal(getInteractLabel("exit"), "そとへ でる");
  assert.equal(getInteractLabel("wardrobe"), "きがえる");
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
