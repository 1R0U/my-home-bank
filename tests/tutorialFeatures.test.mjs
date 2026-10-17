import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { FEATURE_TUTORIALS, featureStorageKey, getFeatureTutorial, getScreenTutorial } from "../lib/tutorialFeatures.ts";

test("大人の初回案内はホームから子供追加だけに続き、設定全体を含めない", () => {
  const home = getFeatureTutorial("parent", "home");
  assert.deepEqual(home.steps.map((step) => step.id), ["parent-home-summary", "parent-settings", "parent-settings-family", "parent-family-add", "parent-family-code", "done"]);
  assert.deepEqual(getFeatureTutorial("parent", "settings").steps.map((step) => step.id), ["parent-settings-profile", "parent-settings-other", "parent-settings-credits", "parent-settings-summary", "done"]);
});

test("機能の案内は自分の画面内で完了し、別機能への巡回や実データ変更を要求しない", () => {
  for (const [role, features] of Object.entries(FEATURE_TUTORIALS)) {
    assert.equal(new Set(features.map((item) => item.id)).size, features.length);
    for (const feature of features) {
      assert.equal(new Set(feature.steps.map((step) => step.id)).size, feature.steps.length);
      assert.equal(feature.steps.at(-1).id, "done");
      for (const step of feature.steps) {
        assert.ok(!step.explanation?.nextRoute && !step.explanation?.returnTo, `${role}/${feature.id}/${step.id}`);
        assert.ok(!step.townRoute, "他の建物へ向かう手順は含めない");
        const path = step.path ?? step.explanation?.path ?? feature.path;
        assert.ok(path === feature.path || (feature.id === "home" && path === "/settings-adult"));
      }
    }
  }
});

test("ロール・画面・町と家の位置に応じて機能を解決する", () => {
  for (const [role, features] of Object.entries(FEATURE_TUTORIALS)) {
    for (const feature of features) {
      if (feature.id === "family") continue;
      assert.equal(getScreenTutorial(role, feature.path, feature.id === "house" ? "house" : "town"), feature.id);
    }
  }
  assert.equal(getScreenTutorial("child", "/tasks-adult"), null);
  assert.equal(getScreenTutorial("parent", "/tasks-child"), null);
  assert.equal(getScreenTutorial("child", "/login"), null);
  assert.equal(getScreenTutorial("parent", "/savings-adult"), "savings");
  assert.equal(getScreenTutorial("child", "/savings-child"), "savings");
  assert.equal(getScreenTutorial("parent", "/savings-child"), null);
  assert.equal(getScreenTutorial("child", "/savings-adult"), null);
  assert.equal(getScreenTutorial("parent", "/savings"), null);
  assert.equal(getScreenTutorial("child", "/savings"), null);
  assert.equal(getScreenTutorial("parent", "/history-adult"), "history");
  assert.equal(getScreenTutorial("child", "/history-child"), "history");
  assert.equal(getScreenTutorial("parent", "/history-child"), null);
  assert.equal(getScreenTutorial("child", "/history-adult"), null);
  assert.equal(getScreenTutorial("parent", "/history"), null);
  assert.equal(getScreenTutorial("child", "/history"), null);
  assert.equal(getScreenTutorial("parent", "/bank-adult"), "bank");
  assert.equal(getScreenTutorial("child", "/bank-child"), "bank");
  assert.equal(getScreenTutorial("parent", "/notifications-adult"), "board");
  assert.equal(getScreenTutorial("child", "/notifications-child"), "board");
  assert.equal(getScreenTutorial("parent", "/bank-child"), null);
  assert.equal(getScreenTutorial("child", "/bank-adult"), null);
  assert.equal(getScreenTutorial("parent", "/notifications-child"), null);
  assert.equal(getScreenTutorial("child", "/notifications-adult"), null);
  assert.equal(getScreenTutorial("parent", "/settings-adult"), "settings");
  assert.equal(getScreenTutorial("child", "/settings-child"), "settings");
  assert.equal(getScreenTutorial("parent", "/settings-child"), null);
  assert.equal(getScreenTutorial("child", "/settings-adult"), null);
});

test("機能の入口と説明対象は実在する画面を指す", () => {
  for (const features of Object.values(FEATURE_TUTORIALS)) for (const feature of features) {
    const paths = [feature.path, ...feature.steps.map((step) => step.path ?? step.explanation?.path ?? feature.path)];
    for (const path of paths) {
      const filename = `${path.slice(1)}.tsx`;
      assert.ok(existsSync(new URL(`../app/${filename}`, import.meta.url)) || existsSync(new URL(`../app/(adult)/${filename}`, import.meta.url)), `${feature.id}: ${path}`);
    }
  }
});

test("表示履歴は利用者・ロール・機能ごとに分かれ、旧形式と衝突しない", () => {
  const keys = new Set();
  for (const user of ["a", "b"]) for (const role of ["parent", "child"]) for (const { id } of FEATURE_TUTORIALS[role]) {
    const key = featureStorageKey(user, role, id);
    assert.ok(key.startsWith("tutorial:v2:"));
    assert.ok(!keys.has(key));
    keys.add(key);
  }
});
