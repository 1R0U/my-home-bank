// キャラクターの肖像（Issue #306）のブリッジ・HTML・キャッシュのテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  createRenderPortraitIntent,
  encodePortraitMessage,
  getPortraitKey,
  parsePortraitEvent,
  parsePortraitIntent,
} from "../lib/rpg-hub/portraitBridge.ts";
import { pickValidEquipment } from "../lib/rpg-hub/bridge.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";
import { PORTRAIT_IMAGE_SIZE, buildPortraitHtml } from "../components/rpg-hub-web/sceneHtml.ts";
import { MAX_PORTRAIT_IMAGES, usePortraitStore } from "../store/portraitStore.ts";

const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;
const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** @returns 基準にする見た目 */
const baseLook = () => ({
  characterType: "frog",
  equipment: { face: GLASSES, head: HAT },
  palette: { accent: "#a78bfa", skin: "#f2a1c2" },
  season: "autumn",
});

// --- getPortraitKey ---

test("同じ見た目なら、枠を書く順番が違っても同じキーになる", () => {
  const reordered = {
    characterType: "frog",
    equipment: { head: HAT, face: GLASSES },
    palette: { skin: "#f2a1c2", accent: "#a78bfa" },
    season: "autumn",
  };
  assert.equal(getPortraitKey(reordered), getPortraitKey(baseLook()));
});

test("見た目が1か所でも違えば、違うキーになる", () => {
  const base = getPortraitKey(baseLook());
  const variants = [
    { ...baseLook(), characterType: "cat" },
    { ...baseLook(), season: "winter" },
    { ...baseLook(), equipment: { head: HAT } },
    { ...baseLook(), equipment: { face: GLASSES, head: RPG_HUB_ASSETS.wearableCap } },
    { ...baseLook(), palette: { accent: "#a78bfa" } },
    { ...baseLook(), palette: { accent: "#a78bfa", skin: "#4a90e2" } },
  ];
  const keys = variants.map(getPortraitKey);
  keys.forEach((key) => assert.notEqual(key, base));
  // 違う見た目どうしも重ならない
  assert.equal(new Set(keys).size, keys.length);
});

test("何も着ていない・色の指定が無い見た目もキーにできる", () => {
  const key = getPortraitKey({ characterType: "hamster", equipment: {}, palette: {}, season: "spring" });
  assert.equal(typeof key, "string");
  assert.notEqual(key, getPortraitKey(baseLook()));
});

test("依頼には見た目とそのキーが入る", () => {
  const look = baseLook();
  assert.deepEqual(createRenderPortraitIntent(look), {
    key: getPortraitKey(look),
    look,
    type: "renderPortrait",
  });
});

// --- parsePortraitIntent ---

test("正しい依頼はそのまま通す（文字列でも受け取れる）", () => {
  const intent = createRenderPortraitIntent(baseLook());
  const result = parsePortraitIntent(encodePortraitMessage(intent));
  assert.equal(result.success, true);
  assert.deepEqual(result.intent, intent);
});

test("着けられない装備・候補に無い形式の色は、その枠だけ落として通す", () => {
  const result = parsePortraitIntent({
    key: "k",
    look: {
      characterType: "frog",
      // 帽子を顔の枠へ・カタログに無いもの → どちらも落とす
      equipment: { body: "no-such-item", face: HAT, head: HAT },
      palette: { accent: "not-a-color", skin: "#f2a1c2" },
      season: "summer",
    },
    type: "renderPortrait",
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.intent.look.equipment, { head: HAT });
  assert.deepEqual(result.intent.look.palette, { skin: "#f2a1c2" });
});

test("種類・季節が不正な依頼は捨てる（形と照明そのものを決めるため）", () => {
  const badType = createRenderPortraitIntent({ ...baseLook(), characterType: "dragon" });
  const badSeason = createRenderPortraitIntent({ ...baseLook(), season: "rainy" });
  assert.equal(parsePortraitIntent(badType).success, false);
  assert.equal(parsePortraitIntent(badSeason).success, false);
});

test("形の崩れた依頼は捨てる", () => {
  const valid = createRenderPortraitIntent(baseLook());
  const cases = [
    "not json",
    null,
    [],
    { ...valid, type: "setMap" },
    { ...valid, key: "" },
    { ...valid, look: null },
    { ...valid, look: { ...valid.look, equipment: [] } },
    { ...valid, look: { ...valid.look, palette: "pink" } },
  ];
  cases.forEach((raw) => assert.equal(parsePortraitIntent(raw).success, false, JSON.stringify(raw)));
});

test("pickValidEquipment は、我が家タウンと同じく着けられる枠だけを残す", () => {
  assert.deepEqual(pickValidEquipment({ face: GLASSES, head: GLASSES }), { face: GLASSES });
  assert.equal(pickValidEquipment("hat"), null);
  assert.equal(pickValidEquipment(null), null);
});

// --- parsePortraitEvent ---

test("準備完了・画像・エラーのイベントを通す", () => {
  assert.deepEqual(parsePortraitEvent('{"event":"ready"}'), { event: { event: "ready" }, success: true });
  assert.deepEqual(parsePortraitEvent({ dataUrl: PNG, event: "portrait", key: "k" }), {
    event: { dataUrl: PNG, event: "portrait", key: "k" },
    success: true,
  });
  assert.deepEqual(parsePortraitEvent({ event: "error", message: "x" }), {
    event: { event: "error", message: "x" },
    success: true,
  });
});

test("PNG の data URL 以外の画像は受け取らない（そのまま <Image> に渡すため）", () => {
  const cases = [
    "https://example.com/a.png",
    "file:///etc/passwd",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,",
    42,
  ];
  cases.forEach((dataUrl) => {
    assert.equal(parsePortraitEvent({ dataUrl, event: "portrait", key: "k" }).success, false, String(dataUrl));
  });
});

test("大きすぎる画像は受け取らない", () => {
  const huge = PNG + "A".repeat(MAX_PORTRAIT_DATA_URL_LENGTH);
  assert.equal(parsePortraitEvent({ dataUrl: huge, event: "portrait", key: "k" }).success, false);
});

test("キーの無い画像・未知のイベントは捨てる", () => {
  assert.equal(parsePortraitEvent({ dataUrl: PNG, event: "portrait" }).success, false);
  assert.equal(parsePortraitEvent({ event: "navigate", route: "bank" }).success, false);
  assert.equal(parsePortraitEvent("{").success, false);
});

// --- buildPortraitHtml ---

test("肖像のHTMLは、キャンバスを固定の大きさにしてスクリプトを埋め込む", () => {
  const html = buildPortraitHtml("/* babylon */", "/* portrait */");
  assert.match(html, new RegExp(`width: ${PORTRAIT_IMAGE_SIZE}px; height: ${PORTRAIT_IMAGE_SIZE}px;`));
  // Babylon を先に読み込む（肖像のスクリプトはグローバルの BABYLON を使うため）
  assert.ok(html.indexOf("/* babylon */") < html.indexOf("/* portrait */"));
  // 我が家タウン用の値は埋め込まない
  assert.doesNotMatch(html, /__RPG_HUB_/);
});

test("肖像のHTMLでも、ソース中の</scriptは早期終了しないようエスケープする", () => {
  const html = buildPortraitHtml("</script>evil", "</SCRIPT>evil2");
  assert.doesNotMatch(html, /<\/script>evil/i);
});

// --- usePortraitStore ---

test("描いた画像を覚え、上限を超えたら古いものから捨てる", () => {
  usePortraitStore.setState({ images: {} });
  const { setImage } = usePortraitStore.getState();
  for (let i = 0; i < MAX_PORTRAIT_IMAGES + 2; i += 1) setImage(`key-${i}`, `${PNG}${i}`);

  const images = usePortraitStore.getState().images;
  assert.equal(Object.keys(images).length, MAX_PORTRAIT_IMAGES);
  assert.equal(images["key-0"], undefined);
  assert.equal(images["key-1"], undefined);
  assert.equal(images[`key-${MAX_PORTRAIT_IMAGES + 1}`], `${PNG}${MAX_PORTRAIT_IMAGES + 1}`);
});

test("使い直した画像は新しい側へ寄せ、先に捨てられないようにする", () => {
  usePortraitStore.setState({ images: {} });
  const { setImage } = usePortraitStore.getState();
  for (let i = 0; i < MAX_PORTRAIT_IMAGES; i += 1) setImage(`key-${i}`, `${PNG}${i}`);
  // いちばん古い key-0 を描き直してから、1枚足す
  setImage("key-0", `${PNG}new`);
  setImage("key-extra", `${PNG}extra`);

  const images = usePortraitStore.getState().images;
  assert.equal(images["key-0"], `${PNG}new`);
  assert.equal(images["key-1"], undefined);
});

test("同じ画像を入れ直しても、状態を変えない（画面を描き直させない）", () => {
  usePortraitStore.setState({ images: {} });
  usePortraitStore.getState().setImage("k", PNG);
  const before = usePortraitStore.getState().images;
  usePortraitStore.getState().setImage("k", PNG);
  assert.equal(usePortraitStore.getState().images, before);
});
