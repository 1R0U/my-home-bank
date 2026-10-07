import assert from "node:assert/strict";
import test from "node:test";
import {
  countUnreadNotifications,
  formatNotificationTime,
  markNotificationsReadLocally,
  splitNotificationsByTab,
  toAppNotification,
} from "../lib/notifications.ts";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  NOTIFICATION_FETCH_LIMIT,
} from "../lib/notificationService.ts";

/** テスト用のお知らせを作る。 */
function makeNotification(overrides) {
  return {
    body: "",
    created_at: "2026-10-07T00:00:00Z",
    id: "n-1",
    read_at: null,
    route: null,
    title: "お知らせ",
    user_id: "user-1",
    ...overrides,
  };
}

// --- 未読と既読への振り分け（Issue #354） ---

test("未読と既読に分け、それぞれ新しい順に並べる", () => {
  const result = splitNotificationsByTab([
    makeNotification({ created_at: "2026-10-05T00:00:00Z", id: "old-unread" }),
    makeNotification({ created_at: "2026-10-06T00:00:00Z", id: "read", read_at: "2026-10-06T01:00:00Z" }),
    makeNotification({ created_at: "2026-10-07T00:00:00Z", id: "new-unread" }),
  ]);

  assert.deepEqual(result.unread.map((n) => n.id), ["new-unread", "old-unread"]);
  assert.deepEqual(result.read.map((n) => n.id), ["read"]);
});

test("振り分けても元の配列の並びは変えない", () => {
  const list = [
    makeNotification({ created_at: "2026-10-05T00:00:00Z", id: "a" }),
    makeNotification({ created_at: "2026-10-07T00:00:00Z", id: "b" }),
  ];
  splitNotificationsByTab(list);
  assert.deepEqual(list.map((n) => n.id), ["a", "b"]);
});

test("未読の件数を数える", () => {
  assert.equal(countUnreadNotifications([]), 0);
  assert.equal(
    countUnreadNotifications([
      makeNotification({ id: "a" }),
      makeNotification({ id: "b", read_at: "2026-10-07T01:00:00Z" }),
      makeNotification({ id: "c" }),
    ]),
    2,
  );
});

// --- 画面側で先に既読にする ---

test("指定したお知らせだけを既読にする", () => {
  const result = markNotificationsReadLocally(
    [makeNotification({ id: "a" }), makeNotification({ id: "b" })],
    ["a"],
    "2026-10-07T02:00:00Z",
  );
  assert.equal(result[0].read_at, "2026-10-07T02:00:00Z");
  assert.equal(result[1].read_at, null);
});

test("null を渡すと未読をすべて既読にする", () => {
  const result = markNotificationsReadLocally(
    [makeNotification({ id: "a" }), makeNotification({ id: "b" })],
    null,
    "2026-10-07T02:00:00Z",
  );
  assert.equal(countUnreadNotifications(result), 0);
});

test("既読のものは、読んだ時刻を変えない（DBの mark_notifications_read と同じ）", () => {
  const result = markNotificationsReadLocally(
    [makeNotification({ id: "a", read_at: "2026-10-01T00:00:00Z" })],
    null,
    "2026-10-07T02:00:00Z",
  );
  assert.equal(result[0].read_at, "2026-10-01T00:00:00Z");
});

// --- DBの行からの変換 ---

test("DBの行をお知らせへ変換する", () => {
  const row = {
    body: "本文",
    created_at: "2026-10-07T00:00:00Z",
    id: "n-1",
    read_at: null,
    route: "tasks",
    title: "見出し",
    user_id: "user-1",
  };
  assert.deepEqual(toAppNotification(row), row);
});

test("知らない行き先は捨てずに「行き先なし」にする", () => {
  // DBに新しい行き先が先に足されても、お知らせ自体は読めるようにする
  assert.equal(toAppNotification({ ...makeNotification(), route: "loan" }).route, null);
  assert.equal(toAppNotification({ ...makeNotification(), route: "/settings" }).route, null);
});

test("本文が無い行は空文字にする", () => {
  assert.equal(toAppNotification({ ...makeNotification(), body: null }).body, "");
});

// --- 届いた時刻の表示（家庭の暦＝日本時間） ---

test("届いた時刻を日本時間の「月/日 時:分」で出す", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  // UTC 2026-10-07 00:05 は日本時間 10/7 9:05
  assert.equal(formatNotificationTime("2026-10-07T00:05:00Z", now), "10/7 9:05");
});

test("日本時間で日付が変わる時刻は、翌日として出す", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  // UTC 10/6 15:30 は日本時間 10/7 0:30
  assert.equal(formatNotificationTime("2026-10-06T15:30:00Z", now), "10/7 0:30");
});

test("今年でないお知らせは年も出す", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(formatNotificationTime("2025-12-31T14:59:00Z", now), "2025/12/31 23:59");
});

// --- Supabaseとのやり取り ---

test("fetchNotificationsは自分あてを新しい順に上限つきで取る", async () => {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    async limit(count) {
      calls.push(["limit", count]);
      return { data: [makeNotification({ route: "unknown" })], error: null };
    },
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };

  const result = await fetchNotifications("user-1", client);

  assert.deepEqual(calls, [
    ["from", "notifications"],
    ["select", "id, user_id, title, body, route, created_at, read_at"],
    ["eq", "user_id", "user-1"],
    ["order", "created_at", { ascending: false }],
    ["limit", NOTIFICATION_FETCH_LIMIT],
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].route, null);
});

test("fetchNotificationsは取得の失敗をそのまま投げる", async () => {
  const failure = new Error("network");
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: null, error: failure }),
  };
  await assert.rejects(fetchNotifications("user-1", { from: () => query }), failure);
});

test("markNotificationsReadは指定したidで既読のRPCを呼ぶ", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: 1, error: null };
    },
  };
  assert.equal(await markNotificationsRead(["n-1"], client), 1);
  assert.deepEqual(called, { args: { p_notification_ids: ["n-1"] }, fn: "mark_notifications_read" });
});

test("markNotificationsReadにnullを渡すと、すべて既読にする呼び出しになる", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { args, fn };
      return { data: 3, error: null };
    },
  };
  assert.equal(await markNotificationsRead(null, client), 3);
  assert.deepEqual(called, { args: { p_notification_ids: null }, fn: "mark_notifications_read" });
});

test("markNotificationsReadはRPCの失敗をそのまま投げる", async () => {
  const failure = new Error("denied");
  const client = { rpc: async () => ({ data: null, error: failure }) };
  await assert.rejects(markNotificationsRead(["n-1"], client), failure);
});

test("fetchUnreadNotificationCountは自分あての未読を、行を取らずに数える", async () => {
  const calls = [];
  const query = {
    select(columns, options) {
      calls.push(["select", columns, options]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    async is(column, value) {
      calls.push(["is", column, value]);
      return { count: 150, data: null, error: null };
    },
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };

  // 一覧の上限（NOTIFICATION_FETCH_LIMIT）を超える件数もそのまま返す
  assert.equal(await fetchUnreadNotificationCount("user-1", client), 150);
  assert.deepEqual(calls, [
    ["from", "notifications"],
    ["select", "id", { count: "exact", head: true }],
    ["eq", "user_id", "user-1"],
    ["is", "read_at", null],
  ]);
});

test("fetchUnreadNotificationCountは件数が返らなければ0、失敗はそのまま投げる", async () => {
  const makeClient = (result) => {
    const query = { select: () => query, eq: () => query, is: async () => result };
    return { from: () => query };
  };
  assert.equal(await fetchUnreadNotificationCount("user-1", makeClient({ count: null, error: null })), 0);
  const failure = new Error("network");
  await assert.rejects(
    fetchUnreadNotificationCount("user-1", makeClient({ count: null, error: failure })),
    failure,
  );
});
