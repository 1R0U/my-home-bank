import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  canUseFeature,
  CHILD_FEATURES,
  CLOSED_FEATURE_LINES,
  CLOSED_FEATURE_TUTORIAL_STEPS,
  getRouteFeature,
  isChildFeatureEnabled,
} from "../lib/childFeatures.ts";
import { fetchChildFeatureRestrictions, setChildFeatureEnabled } from "../lib/childFeatureService.ts";
import { TUTORIAL_STEPS } from "../lib/tutorial.ts";

/**
 * 子供ごとの機能の使う・使わない（Issue #348）。
 */

const restrictions = [{ feature: "bank", user_id: "child-a" }];

test("使わないにした子供だけが、その機能を使えない", () => {
  assert.equal(isChildFeatureEnabled(restrictions, "child-a", "bank"), false);
  assert.equal(isChildFeatureEnabled(restrictions, "child-b", "bank"), true);
  // 行が無ければ使える（何も設定していない家族は今までどおり）
  assert.equal(isChildFeatureEnabled([], "child-a", "bank"), true);
});

test("制限は子供のときだけかかり、親・ロール未確定・利用者不明では止めない", () => {
  assert.equal(canUseFeature(restrictions, { id: "child-a" }, "child", "bank"), false);
  assert.equal(canUseFeature(restrictions, { id: "child-b" }, "child", "bank"), true);
  // 親のIDが一覧に入っていても（入らない前提だが）親は止めない
  assert.equal(canUseFeature(restrictions, { id: "child-a" }, "parent", "bank"), true);
  assert.equal(canUseFeature(restrictions, { id: "child-a" }, undefined, "bank"), true);
  assert.equal(canUseFeature(restrictions, null, "child", "bank"), true);
});

test("町の建物のうち、切り替えの対象は銀行だけ", () => {
  assert.equal(getRouteFeature("bank"), "bank");
  for (const route of ["board", "exit", "history", "house", "store", "tasks", "wardrobe"]) {
    assert.equal(getRouteFeature(route), null, route);
  }
});

test("使わない機能には、入れないことを伝える言葉がある", () => {
  for (const { id } of CHILD_FEATURES) {
    assert.ok(CLOSED_FEATURE_LINES[id].length > 0, id);
  }
});

test("使わない機能で飛ばす案内の手順は、子供の案内に実在する", () => {
  const stepIds = new Set(TUTORIAL_STEPS.child.map((step) => step.id));
  for (const { id } of CHILD_FEATURES) {
    for (const stepId of CLOSED_FEATURE_TUTORIAL_STEPS[id]) {
      assert.ok(stepIds.has(stepId), `${id}: ${stepId}`);
    }
  }
});

test("設定画面に並べる機能と、DBの feature の制約がそろっている", () => {
  const sql = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n");
  const checks = [...sql.matchAll(/child_feature_restrictions_feature_check check \(feature in \(([^)]*)\)\)/g)];
  assert.ok(checks.length > 0, "feature の制約が見つからない");
  const allowed = checks.at(-1)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed.sort(), CHILD_FEATURES.map((feature) => feature.id).sort());
});

test("家族の「使わない」を、家族で絞って取得する", async () => {
  const calls = [];
  const query = {
    select(...args) {
      calls.push(["select", ...args]);
      return query;
    },
    eq(...args) {
      calls.push(["eq", ...args]);
      return Promise.resolve({ data: restrictions, error: null });
    },
  };
  const rows = await fetchChildFeatureRestrictions("family-1", {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  });
  assert.deepEqual(rows, restrictions);
  assert.deepEqual(calls, [
    ["from", "child_feature_restrictions"],
    ["select", "user_id, feature"],
    ["eq", "family_id", "family-1"],
  ]);
});

test("切り替えは、子供・機能・使うかをRPCへ渡し、失敗は投げる", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: null, error: null };
    },
  };
  await setChildFeatureEnabled("child-a", "bank", false, client);
  assert.deepEqual(called, {
    args: { p_enabled: false, p_feature: "bank", p_user_id: "child-a" },
    fn: "set_child_feature_enabled",
  });

  const failing = { rpc: async () => ({ data: null, error: new Error("機能の使う・使わないを決められるのは親だけです") }) };
  await assert.rejects(() => setChildFeatureEnabled("child-a", "bank", true, failing), /親だけ/);
});
