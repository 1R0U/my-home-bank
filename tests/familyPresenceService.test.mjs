import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToFamilyTownPresence } from "../lib/familyPresenceService.ts";

/** Supabase Realtimeのチャンネルを模したモック。テストから状態・呼び出しを確かめられる。 */
function createMockChannel() {
  let syncHandler;
  let subscribeCallback;
  let presenceState = {};
  const trackCalls = [];
  let untrackCount = 0;

  return {
    on(type, filter, handler) {
      if (type === "presence" && filter.event === "sync") syncHandler = handler;
      return this;
    },
    subscribe(callback) {
      subscribeCallback = callback;
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
    // テストから使うヘルパー（実物のAPIには無い）
    _setPresenceState(nextState) {
      presenceState = nextState;
    },
    _triggerSync() {
      syncHandler?.();
    },
    /** subscribe()のコールバックへstatusを渡す（初回の成立・失敗、再接続など）。 */
    _fireStatus(status, error) {
      subscribeCallback?.(status, error);
    },
    _trackCalls: trackCalls,
    get _untrackCount() {
      return untrackCount;
    },
  };
}

/**
 * `.channel()` を呼ぶたびに新しいモックチャンネルを作り、`statusSequence` の先頭から
 * 順に最初のstatusとして割り当てる（再試行のテスト用）。使い切ったら既定で成功させる。
 */
function createMockClient(statusSequence = ["SUBSCRIBED"]) {
  const queue = [...statusSequence];
  const channels = [];
  const removeCalls = [];
  const createCalls = [];

  return {
    channel(name, options) {
      createCalls.push({ name, options });
      const channel = createMockChannel();
      channels.push(channel);
      const status = queue.length > 0 ? queue.shift() : "SUBSCRIBED";
      queueMicrotask(() => channel._fireStatus(status));
      return channel;
    },
    async removeChannel(channel) {
      removeCalls.push(channel);
      return { error: null, status: "ok" };
    },
    _channels: channels,
    _createCalls: createCalls,
    _removeCalls: removeCalls,
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("subscribeToFamilyTownPresence: 家族IDでチャンネルを分け、自分のユーザーIDをPresenceのkeyにする", async () => {
  const client = createMockClient();

  await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);

  assert.deepEqual(client._createCalls, [
    { name: "family-town:family-1", options: { config: { presence: { key: "user-1" } } } },
  ]);
});

test("setPosition: 送信を間引き、間引いている間に来た最後の値を必ず送る", async () => {
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    throttleMs: 30,
  });
  const channel = client._channels[0];

  // 1回目は（直前の送信が無いため）即座に送る。2・3回目は間引かれ、最後の値だけが残る。
  subscription.setPosition({ facingY: 0, x: 1, z: 1 });
  subscription.setPosition({ facingY: 0, x: 2, z: 2 });
  subscription.setPosition({ facingY: 0, x: 3, z: 3 });

  assert.equal(channel._trackCalls.length, 1);
  assert.equal(channel._trackCalls[0].x, 1);

  await wait(40);

  assert.equal(channel._trackCalls.length, 2);
  assert.equal(channel._trackCalls[1].x, 3);
  assert.equal(channel._trackCalls[1].z, 3);
  assert.equal(typeof channel._trackCalls[1].updatedAt, "number");
});

test("clearPosition: untrackで位置を取り下げる", async () => {
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    throttleMs: 0,
  });
  const channel = client._channels[0];

  subscription.setPosition({ facingY: 0, x: 1, z: 1 });
  subscription.clearPosition();

  assert.equal(channel._untrackCount, 1);
});

test("clearPosition: 既に取り下げ済み（まだ一度も送っていない）なら何もしない", async () => {
  // 屋内にいる間、位置の更新のたびにuntrackが送られ続けていた問題の再現（1R0Uさんレビュー指摘）。
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  const channel = client._channels[0];

  subscription.clearPosition();
  subscription.clearPosition();
  subscription.clearPosition();

  assert.equal(channel._untrackCount, 0);
});

test("clearPosition: 送った後に続けて呼んでも、untrackは1回だけ", async () => {
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    throttleMs: 0,
  });
  const channel = client._channels[0];

  subscription.setPosition({ facingY: 0, x: 1, z: 1 });
  subscription.clearPosition();
  subscription.clearPosition();

  assert.equal(channel._untrackCount, 1);
});

test("stop: removeChannelでチャンネルを解除する", async () => {
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  const channel = client._channels[0];

  subscription.stop();

  assert.deepEqual(client._removeCalls, [channel]);
});

test("onChange: 自分自身を除いて通知する", async () => {
  const client = createMockClient();
  const received = [];

  await subscribeToFamilyTownPresence("family-1", "user-1", (positions) => received.push(positions), client);
  const channel = client._channels[0];

  channel._setPresenceState({
    "user-1": [{ facingY: 0, presence_ref: "self-ref", updatedAt: 1, x: 0, z: 0 }],
    "user-2": [{ facingY: 2, presence_ref: "ref-a", updatedAt: 1, x: 5, z: 6 }],
  });
  channel._triggerSync();

  assert.deepEqual(received.at(-1), { "user-2": { facingY: 2, x: 5, z: 6 } });
});

test("onChange: 同じ利用者の複数エントリ（複数端末）では、送信時刻が最新のものを使う", async () => {
  // 並び順（参加・差分の順）ではなく updatedAt で新しさを判定する（1R0Uさんレビュー指摘：
  // 配列の最後が必ずしも最新ではなく、親がスマホとタブレット両方で町にいると矢印が飛ぶ）。
  const client = createMockClient();
  const received = [];

  await subscribeToFamilyTownPresence("family-1", "user-1", (positions) => received.push(positions), client);
  const channel = client._channels[0];

  channel._setPresenceState({
    "user-2": [
      { facingY: 0, presence_ref: "newer", updatedAt: 500, x: 1, z: 1 },
      { facingY: 2, presence_ref: "older", updatedAt: 100, x: 5, z: 6 },
    ],
  });
  channel._triggerSync();

  assert.deepEqual(received.at(-1), { "user-2": { facingY: 0, x: 1, z: 1 } });
});

test("onChange: 誰も居なければ空を通知する", async () => {
  const client = createMockClient();
  const received = [];

  await subscribeToFamilyTownPresence("family-1", "user-1", (positions) => received.push(positions), client);
  const channel = client._channels[0];

  channel._setPresenceState({});
  channel._triggerSync();

  assert.deepEqual(received.at(-1), {});
});

test("購読が最初からSUBSCRIBEDにならない場合（CHANNEL_ERRORなど）は、間隔をあけて再試行する", async () => {
  const client = createMockClient(["CHANNEL_ERROR", "SUBSCRIBED"]);

  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    retryDelaysMs: [10],
  });

  assert.ok(subscription);
  assert.equal(client._channels.length, 2);
  // 失敗した1回目のチャンネルは解除し、同じインスタンスで再利用しない。
  assert.deepEqual(client._removeCalls, [client._channels[0]]);
});

test("再試行をすべて使い切っても失敗したら、諦めてrejectする", async () => {
  const client = createMockClient(["CHANNEL_ERROR", "TIMED_OUT"]);

  await assert.rejects(() =>
    subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, { retryDelaysMs: [5] }),
  );

  assert.equal(client._channels.length, 2);
  assert.equal(client._removeCalls.length, 2);
});

test("一度SUBSCRIBEDになった後に起きる一時的な切断（CHANNEL_ERRORなど）では、チャンネルを解除しない", async () => {
  // Supabaseの自動再接続に任せる。ここでremoveChannelすると、せっかく繋がった接続を壊してしまう。
  const client = createMockClient();
  await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  const channel = client._channels[0];

  channel._fireStatus("CHANNEL_ERROR");

  assert.equal(client._removeCalls.length, 0);
});

test("再接続後、直前に送っていた位置を送り直す", async () => {
  // 回線が一瞬切れて自動で再参加すると、サーバー側のpresenceは消えている。立ち止まっている間は
  // setPositionが呼ばれないため、送り直さないと他の家族の画面から矢印が消えたままになる
  // （1R0Uさんレビュー指摘）。
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    throttleMs: 0,
  });
  const channel = client._channels[0];

  subscription.setPosition({ facingY: 1, x: 2, z: 3 });
  assert.equal(channel._trackCalls.length, 1);

  channel._fireStatus("SUBSCRIBED");

  assert.equal(channel._trackCalls.length, 2);
  assert.equal(channel._trackCalls[1].x, 2);
  assert.equal(channel._trackCalls[1].z, 3);
});

test("一度も位置を送っていなければ、再接続時に何も送らない", async () => {
  const client = createMockClient();
  await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client);
  const channel = client._channels[0];

  channel._fireStatus("SUBSCRIBED");

  assert.equal(channel._trackCalls.length, 0);
});

test("取り下げた後の再接続では、送り直さない", async () => {
  const client = createMockClient();
  const subscription = await subscribeToFamilyTownPresence("family-1", "user-1", () => undefined, client, {
    throttleMs: 0,
  });
  const channel = client._channels[0];

  subscription.setPosition({ facingY: 0, x: 1, z: 1 });
  subscription.clearPosition();
  channel._fireStatus("SUBSCRIBED");

  assert.equal(channel._trackCalls.length, 1);
});
