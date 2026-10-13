import assert from "node:assert/strict";
import test from "node:test";
import { advanceTutorial, tutorialStorageKey } from "../lib/tutorial.ts";

test("対象外の操作と連打では案内を飛ばさず、最後で止まる", () => {
  assert.equal(advanceTutorial("parent", 0, "parent-create"), 0);
  assert.equal(advanceTutorial("parent", 0, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("parent", 1, "nav-tasks-adult"), 1);
  assert.equal(advanceTutorial("child", 0, "nav-tasks-adult"), 0);
  assert.equal(advanceTutorial("child", 10, "done"), 10);
});

test("初回表示の履歴は利用者・ロールごとに分かれる", () => {
  assert.notEqual(tutorialStorageKey("a", "parent"), tutorialStorageKey("b", "parent"));
  assert.notEqual(tutorialStorageKey("a", "parent"), tutorialStorageKey("a", "child"));
});
