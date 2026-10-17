import assert from "node:assert/strict";
import test from "node:test";
import { advanceTutorial, getTutorialBuildingStepId, TUTORIAL_STEPS, tutorialStorageKey } from "../lib/tutorial.ts";
import { getTutorialArrowRotation } from "../lib/rpg-hub/tutorialArrow.ts";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement.ts";
import { screenToWorldDirection } from "../lib/rpg-hub/townCamera.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";
import { ADULT_NAV_ITEMS } from "../constants/adultNav.ts";

test("対象外の操作と連打では案内を飛ばさず、最後で止まる", () => {
  assert.equal(advanceTutorial("parent", 0, "parent-create"), 0);
  assert.equal(advanceTutorial("parent", 0, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("parent", 1, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("child", 0, "nav-tasks-adult"), 0);
  const last = TUTORIAL_STEPS.child.length - 1;
  assert.equal(advanceTutorial("child", last, "done"), last);
});

test("子供の案内は全6か所を訪ね、戻ってから次の目的地へ進む", () => {
  // 町で訪ねる建物は town- で始まる手順。家の中の手順（child-house-back）も矢印で玄関（exit）を指す（Issue #444）
  assert.deepEqual(
    TUTORIAL_STEPS.child.filter((step) => step.id.startsWith("town-") && step.townRoute).map((step) => step.townRoute),
    ["tasks", "bank", "store", "board", "history", "house"],
  );
  assert.equal(TUTORIAL_STEPS.child.find((step) => step.id === "child-house-back").townRoute, "exit");
  for (const route of ["board", "history", "house"]) {
    const index = TUTORIAL_STEPS.child.findIndex((step) => step.id === `town-${route}`);
    assert.equal(advanceTutorial("child", index, `town-${route}`), index + 1);
    assert.equal(TUTORIAL_STEPS.child[index + 1].id, `child-${route}-back`);
    assert.equal(advanceTutorial("child", index + 1, `town-${route}`), index + 1);
    assert.equal(advanceTutorial("child", index + 1, `child-${route}-back`), index + 2);
  }
});

test("建物を使ったときに進める手順は、町の建物なら town-<行き先>、家の中の玄関なら家の中の手順", () => {
  assert.equal(getTutorialBuildingStepId("tasks"), "town-tasks");
  assert.equal(getTutorialBuildingStepId("house"), "town-house");
  assert.equal(getTutorialBuildingStepId("exit"), "child-house-back");
  // どの手順のIDも、実在する手順を指している
  for (const route of ["tasks", "bank", "store", "board", "history", "house", "exit"]) {
    assert.ok(TUTORIAL_STEPS.child.some((step) => step.id === getTutorialBuildingStepId(route)), route);
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

test("大人の案内は全タブと関連機能を巡り、重複なしで最後まで進む", () => {
  const steps = TUTORIAL_STEPS.parent;
  assert.equal(new Set(steps.map((step) => step.id)).size, steps.length);
  for (const id of ["nav-tasks-adult", "parent-weekly", "parent-limited", "nav-store-adult", "parent-store-manage", "parent-store-requests",
    "nav-loan-adult", "parent-economy-treasury", "parent-economy-price", "parent-loan-settings", "parent-savings-summary", "parent-economy-log",
    "nav-history-adult", "parent-history-period", "nav-main-adult", "parent-balance", "parent-notifications", "parent-town-customize",
    "parent-settings-profile", "parent-settings-family", "parent-settings-other", "parent-settings-credits"]) {
    assert.ok(steps.some((step) => step.id === id), `${id} の紹介がない`);
  }
  let index = 0;
  while (steps[index].id !== "done") {
    const next = advanceTutorial("parent", index, steps[index].id);
    assert.equal(next, index + 1);
    index = next;
  }
  assert.equal(index, steps.length - 1);
});

test("大人用タブを押す案内は、実在するタブを指す", () => {
  // タブの案内IDは `nav-<タブ名>` で作られる（app/(adult)/_layout.tsx）。タブ名を変えたら案内も追従させる
  const tabNames = new Set(ADULT_NAV_ITEMS.map((item) => item.name));
  for (const step of TUTORIAL_STEPS.parent.filter((step) => step.id.startsWith("nav-"))) {
    assert.ok(tabNames.has(step.id.slice("nav-".length)), `${step.id} に対応するタブがない`);
  }
});
