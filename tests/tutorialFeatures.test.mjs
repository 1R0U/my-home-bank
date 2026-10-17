import assert from "node:assert/strict";
import test from "node:test";
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
        assert.ok(path === feature.path || (feature.id === "home" && path === "/settings"));
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
