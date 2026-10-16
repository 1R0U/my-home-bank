// 自分の家の中（Issue #386）の RN ⇄ WebView ブリッジのテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeHouseRoomMessage,
  parseHouseRoomEvent,
  parseHouseRoomIntent,
} from "../lib/rpg-hub/houseRoomBridge.ts";

const look = { characterType: "frog", equipment: {}, palette: {}, season: "spring" };

test("送られてきた配置は、使える分だけに直して受け取る", () => {
  const result = parseHouseRoomIntent(
    encodeHouseRoomMessage({ layout: { closetX: 0.3, placed: [{ floor: "ground", kind: "piano", x: 0.5 }] }, type: "setLayout" }),
  );
  assert.equal(result.success, true);
  assert.deepEqual(result.intent.layout.placed, []);
});

test("RN から送る意図は、送ったとおりに読める", () => {
  const intents = [
    { look, type: "setLook" },
    { floor: "upstairs", standX: 0.3, type: "setFloor" },
    { dx: -0.5, type: "move" },
    { dx: 0, type: "move" },
    { active: false, type: "setActive" },
    { layout: { closetX: 0.3, placed: [{ floor: "upstairs", kind: "bed", x: 0.4 }] }, type: "setLayout" },
    { editing: true, type: "setEditing" },
    { type: "renderThumbnails" },
    { kind: "sofa", phase: "move", type: "dragFurniture", viewX: 120, viewY: 40 },
    { kind: "bed", phase: "drop", type: "dragFurniture", viewX: -5, viewY: 300 },
    { kind: "bed", phase: "cancel", type: "dragFurniture", viewX: 0, viewY: 0 },
    { furnitureId: "closet", type: "walkTo" },
    { type: "stopWalk" },
  ];
  for (const intent of intents) {
    const result = parseHouseRoomIntent(encodeHouseRoomMessage(intent));
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.intent.type, intent.type);
  }
});

test("おかしな意図は受け取らない", () => {
  const bad = [
    "not json",
    [],
    { type: "unknown" },
    { floor: "basement", standX: 0.5, type: "setFloor" },
    { floor: "ground", standX: 1.5, type: "setFloor" },
    { floor: "ground", standX: "0.5", type: "setFloor" },
    { dx: 1.5, type: "move" },
    { dx: "1", type: "move" },
    { type: "move" },
    { active: "yes", type: "setActive" },
    { type: "walkTo" },
    { furnitureId: "", type: "walkTo" },
    { furnitureId: 1, type: "walkTo" },
    { look: { characterType: "dragon" }, type: "setLook" },
    { type: "setLayout" },
    { layout: [], type: "setLayout" },
    { editing: "yes", type: "setEditing" },
    { kind: "door", phase: "move", type: "dragFurniture", viewX: 0, viewY: 0 },
    { kind: "sofa", phase: "jump", type: "dragFurniture", viewX: 0, viewY: 0 },
    { kind: "sofa", phase: "move", type: "dragFurniture", viewX: "1", viewY: 0 },
    { kind: "sofa", phase: "move", type: "dragFurniture", viewX: 0 },
  ];
  for (const raw of bad) {
    assert.equal(parseHouseRoomIntent(typeof raw === "string" ? raw : JSON.stringify(raw)).success, false, JSON.stringify(raw));
  }
});

test("WebView から届くイベントを読める", () => {
  const events = [
    { event: "ready" },
    { event: "characterTapped" },
    { event: "nearby", floor: "ground", furnitureId: "closet" },
    { event: "nearby", floor: "upstairs", furnitureId: null },
    { event: "arrived", floor: "ground", furnitureId: "closet" },
    { event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "closet", x: 120, y: 40 }] },
    { event: "tags", floor: "upstairs", hasCharacter: false, tags: [] },
    { event: "error", message: "こわれた" },
    { event: "error", fatal: true, message: "キャラクターを作れない" },
    { event: "furnitureSelected", floor: "ground", furnitureId: "closet" },
    { event: "furnitureSelected", floor: "upstairs", furnitureId: null },
    // 指は部屋の外まで動かせるので、0〜1の外の位置も受け取る
    { event: "furnitureMoved", floor: "ground", furnitureId: "placed-sofa", x: 1.2 },
    { dataUrl: "data:image/png;base64,AAAA", event: "thumbnail", kind: "sofa" },
    { event: "furnitureDropped", floor: "upstairs", kind: "bed", x: 0.4 },
  ];
  for (const event of events) {
    const result = parseHouseRoomEvent(encodeHouseRoomMessage(event));
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(result.event, event);
  }
});

test("おかしなイベントは受け取らない", () => {
  const bad = [
    { event: "unknown" },
    { event: "nearby", floor: "ground" },
    { event: "nearby", floor: "ground", furnitureId: "" },
    { event: "nearby", floor: "attic", furnitureId: null },
    { event: "arrived", floor: "ground", furnitureId: null },
    { event: "arrived", floor: "attic", furnitureId: "closet" },
    { event: "tags", floor: "attic", hasCharacter: true, tags: [] },
    { event: "tags", floor: "ground", tags: [] },
    { event: "tags", floor: "ground", hasCharacter: "true", tags: [] },
    { event: "tags", floor: "ground", hasCharacter: true, tags: "closet" },
    { event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "closet", x: "1", y: 2 }] },
    {
      event: "tags",
      floor: "ground",
      hasCharacter: true,
      tags: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, x: 0, y: 0 })),
    },
    { event: "furnitureSelected", floor: "ground" },
    { event: "furnitureSelected", floor: "attic", furnitureId: null },
    { event: "furnitureMoved", floor: "ground", furnitureId: "", x: 0.5 },
    { event: "furnitureMoved", floor: "ground", furnitureId: "placed-sofa", x: "0.5" },
    { event: "furnitureMoved", floor: "ground", furnitureId: "placed-sofa" },
    { event: "furnitureDropped", floor: "attic", kind: "bed", x: 0.4 },
    { event: "furnitureDropped", floor: "ground", kind: "door", x: 0.4 },
    { event: "furnitureDropped", floor: "ground", kind: "bed", x: "0.4" },
    // 置けない家具（扉）・知らない家具の絵は受け取らない
    { dataUrl: "data:image/png;base64,AAAA", event: "thumbnail", kind: "door" },
    { dataUrl: "data:image/png;base64,AAAA", event: "thumbnail", kind: "piano" },
    // PNG の data URL でないものは受け取らない
    { dataUrl: "https://example.com/sofa.png", event: "thumbnail", kind: "sofa" },
    { dataUrl: `data:image/png;base64,${"A".repeat(1_000_000)}`, event: "thumbnail", kind: "sofa" },
  ];
  for (const raw of bad) {
    assert.equal(parseHouseRoomEvent(JSON.stringify(raw)).success, false, JSON.stringify(raw));
  }
});
