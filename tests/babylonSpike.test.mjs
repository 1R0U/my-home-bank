import assert from "node:assert/strict";
import test from "node:test";
import {
  createSetBalanceIntent,
  encodeIntent,
  parseBabylonEvent,
  parseIntent,
} from "../lib/babylon-spike/bridge.ts";

test("createSetBalanceIntent は setBalance 意図を組み立てる", () => {
  assert.deepEqual(createSetBalanceIntent(1250), { type: "setBalance", value: 1250 });
});

test("encodeIntent は JSON 文字列にシリアライズする", () => {
  assert.equal(encodeIntent({ type: "setBalance", value: 0 }), '{"type":"setBalance","value":0}');
});

test("parseIntent は正しい setBalance をパースする（文字列/オブジェクト両方）", () => {
  const fromString = parseIntent('{"type":"setBalance","value":1250}');
  assert.deepEqual(fromString, { intent: { type: "setBalance", value: 1250 }, success: true });

  const fromObject = parseIntent({ type: "setBalance", value: -30 });
  assert.deepEqual(fromObject, { intent: { type: "setBalance", value: -30 }, success: true });
});

test("parseIntent は不正な入力を破棄する", () => {
  assert.equal(parseIntent("not-json").success, false);
  assert.equal(parseIntent(42).success, false);
  assert.equal(parseIntent({ type: "setBalance", value: "1250" }).success, false);
  assert.equal(parseIntent({ type: "setBalance", value: Number.POSITIVE_INFINITY }).success, false);
  assert.equal(parseIntent({ type: "unknownIntent" }).success, false);
});

test("parseBabylonEvent は ready / tapped / error をパースする", () => {
  assert.deepEqual(parseBabylonEvent('{"event":"ready"}'), {
    event: { event: "ready" },
    success: true,
  });
  assert.deepEqual(parseBabylonEvent({ event: "tapped", id: "player" }), {
    event: { event: "tapped", id: "player" },
    success: true,
  });
  assert.deepEqual(parseBabylonEvent({ event: "error", message: "boom" }), {
    event: { event: "error", message: "boom" },
    success: true,
  });
});

test("parseBabylonEvent は不正なイベントを破棄する", () => {
  assert.equal(parseBabylonEvent("not-json").success, false);
  assert.equal(parseBabylonEvent({ event: "tapped" }).success, false);
  assert.equal(parseBabylonEvent({ event: "tapped", id: "  " }).success, false);
  assert.equal(parseBabylonEvent({ event: "unknownEvent" }).success, false);
  assert.equal(parseBabylonEvent(null).success, false);
});

test("parseBabylonEvent の error は message 欠落時に空文字へフォールバックする", () => {
  assert.deepEqual(parseBabylonEvent({ event: "error" }), {
    event: { event: "error", message: "" },
    success: true,
  });
});
