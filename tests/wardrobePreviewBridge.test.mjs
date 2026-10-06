// 更衣室のプレビュー（Issue #344）のブリッジ・HTMLのテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSetPreviewLookIntent,
  encodeWardrobePreviewMessage,
  parseWardrobePreviewEvent,
  parseWardrobePreviewIntent,
} from "../lib/rpg-hub/wardrobePreviewBridge.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import {
  WARDROBE_PREVIEW_BACKGROUND,
  buildWardrobePreviewHtml,
} from "../components/rpg-hub-web/sceneHtml.ts";

const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;

/** @returns 基準にする見た目 */
const baseLook = () => ({
  characterType: "cat",
  equipment: { face: GLASSES, head: HAT },
  palette: { accent: "#a78bfa", skin: "#f2a1c2" },
  season: "winter",
});

// --- 意図（RN → WebView） ---

test("送った見た目は、文字列にしてもそのまま読み戻せる", () => {
  const encoded = encodeWardrobePreviewMessage(createSetPreviewLookIntent(baseLook()));
  const result = parseWardrobePreviewIntent(encoded);

  assert.equal(result.success, true);
  assert.deepEqual(result.intent, { look: baseLook(), type: "setLook" });
});

test("不正な装備の枠だけを落として通す", () => {
  // 1枠の不正でキャラクターごと映らないより、その枠を除いた姿で映るほうがよい
  const look = { ...baseLook(), equipment: { face: "no-such-item", head: HAT } };
  const result = parseWardrobePreviewIntent(createSetPreviewLookIntent(look));

  assert.equal(result.success, true);
  assert.deepEqual(result.intent.look.equipment, { head: HAT });
});

test("種類や季節が不正なら見た目ごと捨てる", () => {
  assert.equal(
    parseWardrobePreviewIntent({ look: { ...baseLook(), characterType: "dragon" }, type: "setLook" })
      .success,
    false,
  );
  assert.equal(
    parseWardrobePreviewIntent({ look: { ...baseLook(), season: "rainy" }, type: "setLook" }).success,
    false,
  );
});

test("知らない種類の意図や壊れた値は受け取らない", () => {
  assert.equal(parseWardrobePreviewIntent({ look: baseLook(), type: "renderPortrait" }).success, false);
  assert.equal(parseWardrobePreviewIntent({ type: "setLook" }).success, false);
  assert.equal(parseWardrobePreviewIntent("{").success, false);
  assert.equal(parseWardrobePreviewIntent(null).success, false);
});

// --- イベント（WebView → RN） ---

test("準備完了とエラーを受け取れる", () => {
  assert.deepEqual(parseWardrobePreviewEvent(encodeWardrobePreviewMessage({ event: "ready" })), {
    event: { event: "ready" },
    success: true,
  });
  assert.deepEqual(parseWardrobePreviewEvent({ event: "error", message: "boom" }), {
    event: { event: "error", message: "boom" },
    success: true,
  });
});

test("知らないイベントは受け取らない", () => {
  assert.equal(parseWardrobePreviewEvent({ event: "navigate", route: "bank" }).success, false);
  assert.equal(parseWardrobePreviewEvent("{").success, false);
});

// --- buildWardrobePreviewHtml ---

test("プレビューのHTMLは、指の操作をページに取られないようにしてスクリプトを埋め込む", () => {
  const html = buildWardrobePreviewHtml("/* babylon */", "/* preview */");
  // 回転・ピンチの操作をページのスクロールや拡大に取られないようにする
  assert.match(html, /touch-action: none/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, new RegExp(`background: ${WARDROBE_PREVIEW_BACKGROUND}`));
  // Babylon を先に読み込む（プレビューのスクリプトはグローバルの BABYLON を使うため）
  assert.ok(html.indexOf("/* babylon */") < html.indexOf("/* preview */"));
  // 我が家タウン用の値は埋め込まない
  assert.doesNotMatch(html, /__RPG_HUB_/);
});

test("プレビューのHTMLでも、ソース中の</scriptは早期終了しないようエスケープする", () => {
  const html = buildWardrobePreviewHtml("</script>evil", "</SCRIPT>evil2");
  assert.doesNotMatch(html, /<\/script>evil/i);
});
