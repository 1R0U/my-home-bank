import assert from "node:assert/strict";
import test from "node:test";
import {
  createSetInputEnabledIntent,
  createSetInputIntent,
  createSetMapIntent,
  encodeEvent,
  encodeIntent,
  MAX_INPUT_STEP,
  parseIntent,
  parseRpgHubEvent,
} from "../lib/rpg-hub/bridge.ts";
import { getBuildingParts } from "../lib/rpg-hub/buildingParts.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects.ts";

// --- 意図の組み立て ---

test("createSetMapIntent は setMap 意図を組み立てる", () => {
  const intent = createSetMapIntent([], "spring");
  assert.deepEqual(intent, { objects: [], season: "spring", type: "setMap" });
});

test("createSetInputIntent は setInput 意図を組み立てる", () => {
  assert.deepEqual(createSetInputIntent(0.1, -0.2, "up"), {
    direction: "up",
    type: "setInput",
    x: 0.1,
    z: -0.2,
  });
});

test("createSetInputEnabledIntent は setInputEnabled 意図を組み立てる", () => {
  assert.deepEqual(createSetInputEnabledIntent(false), { enabled: false, type: "setInputEnabled" });
});

test("encodeIntent / encodeEvent は JSON 文字列にシリアライズする", () => {
  assert.equal(
    encodeIntent({ enabled: true, type: "setInputEnabled" }),
    '{"enabled":true,"type":"setInputEnabled"}',
  );
  assert.equal(encodeEvent({ event: "ready" }), '{"event":"ready"}');
});

// --- 意図のパース（WebView 側で使う） ---

test("parseIntent は setMap をパースする（文字列/オブジェクト両方）", () => {
  const fromString = parseIntent('{"type":"setMap","objects":[],"season":"winter"}');
  assert.deepEqual(fromString, {
    intent: { objects: [], season: "winter", type: "setMap" },
    success: true,
  });

  const fromObject = parseIntent({ objects: [], season: "autumn", type: "setMap" });
  assert.equal(fromObject.success, true);
});

test("parseIntent は不正な season や objects を破棄する", () => {
  assert.equal(parseIntent({ objects: [], season: "rainy", type: "setMap" }).success, false);
  assert.equal(parseIntent({ objects: "nope", season: "spring", type: "setMap" }).success, false);
});

test("parseIntent は setInput をパースし、停止（direction: null）も受け付ける", () => {
  assert.deepEqual(parseIntent({ direction: "left", type: "setInput", x: -0.12, z: 0 }), {
    intent: { direction: "left", type: "setInput", x: -0.12, z: 0 },
    success: true,
  });

  assert.deepEqual(parseIntent({ direction: null, type: "setInput", x: 0, z: 0 }), {
    intent: { direction: null, type: "setInput", x: 0, z: 0 },
    success: true,
  });
});

test("parseIntent は setInput の不正な値を破棄する", () => {
  assert.equal(parseIntent({ direction: "up", type: "setInput", x: "1", z: 0 }).success, false);
  assert.equal(
    parseIntent({ direction: "up", type: "setInput", x: Number.NaN, z: 0 }).success,
    false,
  );
  assert.equal(parseIntent({ direction: "diagonal", type: "setInput", x: 0, z: 0 }).success, false);
});

test("parseIntent は許容範囲を超える移動量を破棄する", () => {
  // 巨大な有限値を通すと moveWithinMap の分割ステップ数が発散し、
  // WebView 側のゲームループが実質停止するため、ブリッジで弾く。
  assert.equal(
    parseIntent({ direction: "up", type: "setInput", x: 1e9, z: 0 }).success,
    false,
  );
  assert.equal(
    parseIntent({ direction: "up", type: "setInput", x: 0, z: -1e9 }).success,
    false,
  );
  assert.equal(
    parseIntent({ direction: "up", type: "setInput", x: MAX_INPUT_STEP + 0.01, z: 0 }).success,
    false,
  );

  // 仮想パッドが実際に送る値（最大 0.12）と境界値は通す。
  assert.equal(parseIntent({ direction: "up", type: "setInput", x: 0.12, z: 0 }).success, true);
  assert.equal(
    parseIntent({ direction: "up", type: "setInput", x: MAX_INPUT_STEP, z: -MAX_INPUT_STEP })
      .success,
    true,
  );
});

test("parseIntent は setInputEnabled の非真偽値を破棄する", () => {
  assert.equal(parseIntent({ enabled: "yes", type: "setInputEnabled" }).success, false);
  assert.equal(parseIntent({ enabled: false, type: "setInputEnabled" }).success, true);
});

test("parseIntent は未知の type と壊れた入力を破棄する", () => {
  assert.equal(parseIntent("not-json").success, false);
  assert.equal(parseIntent(42).success, false);
  assert.equal(parseIntent([]).success, false);
  assert.equal(parseIntent({ type: "evalScript" }).success, false);
});

// --- イベントのパース（RN 側で使う） ---

test("parseRpgHubEvent は ready をパースする", () => {
  assert.deepEqual(parseRpgHubEvent('{"event":"ready"}'), {
    event: { event: "ready" },
    success: true,
  });
});

test("parseRpgHubEvent は position をパースする", () => {
  assert.deepEqual(parseRpgHubEvent({ direction: "down", event: "position", x: 1.5, z: -2 }), {
    event: { direction: "down", event: "position", x: 1.5, z: -2 },
    success: true,
  });
});

test("parseRpgHubEvent は position の不正な値を破棄する", () => {
  assert.equal(
    parseRpgHubEvent({ direction: "down", event: "position", x: Number.POSITIVE_INFINITY, z: 0 })
      .success,
    false,
  );
  assert.equal(parseRpgHubEvent({ direction: "nowhere", event: "position", x: 0, z: 0 }).success, false);
});

test("parseRpgHubEvent は nearby をパースし、null も受け付ける", () => {
  assert.deepEqual(parseRpgHubEvent({ event: "nearby", id: "bank" }), {
    event: { event: "nearby", id: "bank" },
    success: true,
  });
  assert.deepEqual(parseRpgHubEvent({ event: "nearby", id: null }), {
    event: { event: "nearby", id: null },
    success: true,
  });
});

test("parseRpgHubEvent は nearby の空文字や非文字列を破棄する", () => {
  assert.equal(parseRpgHubEvent({ event: "nearby", id: "   " }).success, false);
  assert.equal(parseRpgHubEvent({ event: "nearby", id: 5 }).success, false);
});

test("parseRpgHubEvent は許可済みルートの navigate だけを通す", () => {
  assert.deepEqual(parseRpgHubEvent({ event: "navigate", route: "bank" }), {
    event: { event: "navigate", route: "bank" },
    success: true,
  });

  // 許可リストに無いルートは通さない（データ由来で任意の画面へ遷移させない）
  assert.equal(parseRpgHubEvent({ event: "navigate", route: "/settings" }).success, false);
  assert.equal(parseRpgHubEvent({ event: "navigate", route: "https://example.com" }).success, false);
  assert.equal(parseRpgHubEvent({ event: "navigate", route: "admin" }).success, false);
});

test("parseRpgHubEvent は error を通し、message が無くても落ちない", () => {
  assert.deepEqual(parseRpgHubEvent({ event: "error", message: "boom" }), {
    event: { event: "error", message: "boom" },
    success: true,
  });
  assert.deepEqual(parseRpgHubEvent({ event: "error" }), {
    event: { event: "error", message: "" },
    success: true,
  });
});

test("parseRpgHubEvent は未知の event と壊れた入力を破棄する", () => {
  assert.equal(parseRpgHubEvent("not-json").success, false);
  assert.equal(parseRpgHubEvent(null).success, false);
  assert.equal(parseRpgHubEvent({ event: "exec" }).success, false);
});

// --- 建物パーツ定義 ---

test("getBuildingParts は各建物のパーツを返す", () => {
  for (const assetId of [
    RPG_HUB_ASSETS.bank,
    RPG_HUB_ASSETS.history,
    RPG_HUB_ASSETS.store,
    RPG_HUB_ASSETS.tasks,
    RPG_HUB_ASSETS.tree,
  ]) {
    const parts = getBuildingParts(assetId);
    assert.ok(parts.length > 0, `${assetId} のパーツが空です`);
  }
});

test("getBuildingParts は未知のアセットIDでもフォールバックを返す", () => {
  const parts = getBuildingParts("unknown-asset");
  assert.equal(parts.length, 1);
  assert.equal(parts[0].shape, "box");
});

test("建物パーツの寸法と色は描画可能な値になっている", () => {
  const assetIds = Object.values(RPG_HUB_ASSETS);
  for (const assetId of assetIds) {
    for (const part of getBuildingParts(assetId)) {
      assert.match(part.color, /^#[0-9a-f]{6}$/i, `${assetId}: 色が不正 ${part.color}`);
      for (const axis of ["x", "y", "z"]) {
        assert.ok(
          Number.isFinite(part.position[axis]),
          `${assetId}: position.${axis} が有限数値ではありません`,
        );
      }

      // 形状ごとの寸法がすべて正の有限数であること（0 以下だと描画されない）。
      // 円錐の上面直径だけは 0 を許す（Babylon では diameterTop: 0 が円錐になる）。
      const sizes =
        part.shape === "box"
          ? [part.width, part.height, part.depth]
          : part.shape === "cone"
            ? [part.diameter, part.height, part.tessellation]
            : part.shape === "cylinder"
              ? [part.diameterBottom, part.height, part.tessellation]
              : [part.diameter, part.thickness];

      for (const size of sizes) {
        assert.ok(Number.isFinite(size) && size > 0, `${assetId}: 寸法が不正 ${size}`);
      }
    }
  }
});

test("初期マップの全オブジェクトが描画用パーツを解決できる", () => {
  for (const object of INITIAL_MAP_OBJECTS) {
    const parts = getBuildingParts(object.model);
    assert.ok(parts.length > 0, `${object.id} のパーツが解決できません`);
  }
});
