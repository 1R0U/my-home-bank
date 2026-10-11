// 自分の家の中（Issue #386）の RN ⇄ WebView ブリッジのテスト。
import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeHouseRoomMessage,
  parseHouseRoomEvent,
  parseHouseRoomIntent,
} from "../lib/rpg-hub/houseRoomBridge.ts";

const look = { characterType: "frog", equipment: {}, palette: {}, season: "spring" };

test("RN から送る意図は、送ったとおりに読める", () => {
  const intents = [
    { look, type: "setLook" },
    { floor: "upstairs", standX: 0.3, type: "setFloor" },
    { dx: -0.5, type: "move" },
    { dx: 0, type: "move" },
    { active: false, type: "setActive" },
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
    { look: { characterType: "dragon" }, type: "setLook" },
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
    { event: "tags", floor: "ground", tags: [{ id: "closet", x: 120, y: 40 }] },
    { event: "error", message: "こわれた" },
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
    { event: "tags", floor: "attic", tags: [] },
    { event: "tags", floor: "ground", tags: "closet" },
    { event: "tags", floor: "ground", tags: [{ id: "closet", x: "1", y: 2 }] },
    { event: "tags", floor: "ground", tags: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, x: 0, y: 0 })) },
  ];
  for (const raw of bad) {
    assert.equal(parseHouseRoomEvent(JSON.stringify(raw)).success, false, JSON.stringify(raw));
  }
});
