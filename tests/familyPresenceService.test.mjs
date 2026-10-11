import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToFamilyTownPresence } from "../lib/familyPresenceService.ts";

/** Supabase Realtimeのチャンネルを模したモック。テストから状態・呼び出しを確かめられる。
 * @param firstStatus - subscribe() のコールバックへ最初に渡すstatus（既定はSUBSCRIBED） */
function createMockChannel(firstStatus = "SUBSCRIBED") {
  let syncHandler;
  let subscribeCallback;
  let presenceState = {};
  const trackCalls = [];
  let untrackCount = 0;
  let unsubscribeCount = 0;

  return {
    on(type, filter, handler) {
      if (type === "presence" && filter.event === "sync") syncHandler = handler;
      return this;
    },
    subscribe(callback) {
      subscribeCallback = callback;
      queueMicrotask(() => callback(firstStatus));
      return this;
    },
    presenceState() {
      return presenceState;
    },
    async track(payload) {
      trackCalls.push(payload);
      return { status: "ok" };
    },
    async untrack() {
      untrackCount += 1;
      return { status: "ok" };
    },
    async unsubscribe() {
      unsubscribeCount += 1;
      return { status: "ok" };
    },
    // テストから使うヘルパー（実物のAPIには無い）
    _setPresenceState(nextState) {
      presenceState = nextState;
    },
    _triggerSync() {
      syncHandler?.();
    },
    /** 購読が確立した後に、2回目以降のstatus変化を起こす（再接続時の一時的な切断など）。 */
    _triggerStatus(status, error) {
      subscribeCallback?.(status, error);
    },
    _trackCalls: trackCalls,
    get _untrackCount() {
      return untrackCount;
    },
    get _unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

function createMockClient(channel) {
  const calls = [];
  return {
    channel(name, options) {
      calls.push({ name, options });
      return channel;
    },
    _calls: calls,
  };
}

test("subscribeToFamilyTownPresence: 家族IDでチャンネルを分け、自分のユーザーIDをPresenceのkeyにする", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);

  await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);

  assert.deepEqual(client._calls, [
    { name: "family-town:family-1", options: { config: { presence: { key: "user-1" } } } },
  ]);
});

test("setPosition: trackで自分の位置を知らせる", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);

  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  subscription.setPosition({ facingY: 1.5, x: 10, z: -3 });
  await Promise.resolve();

  assert.deepEqual(channel._trackCalls, [{ facingY: 1.5, x: 10, z: -3 }]);
});

test("clearPosition: untrackで位置を取り下げる", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);

  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  subscription.clearPosition();
  await Promise.resolve();

  assert.equal(channel._untrackCount, 1);
});

test("stop: unsubscribeで購読をやめる", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);

  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  subscription.stop();
  await Promise.resolve();

  assert.equal(channel._unsubscribeCount, 1);
});

test("onChange: 自分自身を除き、同じkeyは最後に同期された分を使って通知する", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);
  const received = [];

  await subscribeToFamilyTownPresence("family-1", "user-1", (positions) => received.push(positions), client);

  channel._setPresenceState({
    "user-1": [{ presence_ref: "self-ref", facingY: 0, x: 0, z: 0 }],
    "user-2": [
      { presence_ref: "ref-a", facingY: 0, x: 1, z: 1 },
      { presence_ref: "ref-b", facingY: 2, x: 5, z: 6 },
    ],
  });
  channel._triggerSync();

  assert.deepEqual(received, [{ "user-2": { facingY: 2, x: 5, z: 6 } }]);
});

test("onChange: 誰も居なければ空を通知する", async () => {
  const channel = createMockChannel();
  const client = createMockClient(channel);
  const received = [];

  await subscribeToFamilyTownPresence("family-1", "user-1", (positions) => received.push(positions), client);

  channel._setPresenceState({});
  channel._triggerSync();

  assert.deepEqual(received, [{}]);
});

test("購読が最初からSUBSCRIBEDにならない場合（CHANNEL_ERRORなど）は、Promiseをrejectしチャンネルを解除する", async () => {
  const channel = createMockChannel("CHANNEL_ERROR");
  const client = createMockClient(channel);

  await assert.rejects(() => subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client));
  await Promise.resolve();

  assert.equal(channel._unsubscribeCount, 1);
});

test("一度SUBSCRIBEDになった後に起きる一時的な切断（CHANNEL_ERRORなど）では、チャンネルを解除しない", async () => {
  // Supabaseの自動再接続に任せる。ここでunsubscribeすると、せっかく繋がった接続を壊してしまう。
  const channel = createMockChannel("SUBSCRIBED");
  const client = createMockClient(channel);

  await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  channel._triggerStatus("CHANNEL_ERROR");
  await Promise.resolve();

  assert.equal(channel._unsubscribeCount, 0);
});
