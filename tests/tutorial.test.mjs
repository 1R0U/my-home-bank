import assert from "node:assert/strict";
import test from "node:test";
import { advanceTutorial, TUTORIAL_STEPS, tutorialStorageKey } from "../lib/tutorial.ts";
import { getTutorialArrowRotation } from "../lib/rpg-hub/tutorialNavigation.ts";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement.ts";
import { screenToWorldDirection } from "../lib/rpg-hub/townCamera.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";

test("対象外の操作と連打では案内を飛ばさず、最後で止まる", () => {
  assert.equal(advanceTutorial("parent", 0, "parent-create"), 0);
  assert.equal(advanceTutorial("parent", 0, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("parent", 1, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("child", 0, "nav-tasks-adult"), 0);
  const last = TUTORIAL_STEPS.child.length - 1;
  assert.equal(advanceTutorial("child", last, "done"), last);
});

test("子供の案内は全6か所を訪ね、戻ってから次の目的地へ進む", () => {
  assert.deepEqual(TUTORIAL_STEPS.child.filter((step) => step.townRoute).map((step) => step.townRoute),
    ["tasks", "bank", "store", "board", "history", "house"]);
  for (const route of ["board", "history", "house"]) {
    const index = TUTORIAL_STEPS.child.findIndex((step) => step.id === `town-${route}`);
    assert.equal(advanceTutorial("child", index, `town-${route}`), index + 1);
    assert.equal(TUTORIAL_STEPS.child[index + 1].id, `child-${route}-back`);
    assert.equal(advanceTutorial("child", index + 1, `town-${route}`), index + 1);
    assert.equal(advanceTutorial("child", index + 1, `child-${route}-back`), index + 2);
  }
});

test("矢印は3D画面の上下左右と斜めに一致し、移動に合わせて目的の入口を指す", () => {
  const building = INITIAL_MAP_OBJECTS.find((object) => object.type === "building" && object.route === "tasks");
  const entrance = getBuildingExitPoint(building);
  for (const [x, y, expected] of [[0, -1, 0], [1, 0, 90], [0, 1, 180], [-1, 0, -90], [1, -1, 45]]) {
    const delta = screenToWorldDirection(x, y);
    const player = { x: entrance.x - delta.x * 10, z: entrance.z - delta.z * 10 };
    const rotation = getTutorialArrowRotation(player, building);
    assert.ok(Math.abs(Math.abs(expected) === 180 ? Math.abs(rotation) - 180 : rotation - expected) < 1e-8);
  }
  assert.equal(getTutorialArrowRotation(entrance, building), null);
});

test("初回表示の履歴は利用者・ロールごとに分かれる", () => {
  assert.notEqual(tutorialStorageKey("a", "parent"), tutorialStorageKey("b", "parent"));
  assert.notEqual(tutorialStorageKey("a", "parent"), tutorialStorageKey("a", "child"));
});
