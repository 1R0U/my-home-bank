import assert from "node:assert/strict";
import test from "node:test";
import {
  approveStoreItemRequest,
  createStoreItemRequest,
  fetchStoreItemRequests,
  rejectStoreItemRequest,
} from "../lib/storeItemRequestService.ts";

const input = {
  requested_by: "user-child-1",
  title: "夕飯リクエスト権2",
  description: "夕飯を2回リクエストできる",
  reason: "お手伝いを頑張ったから",
  image_url: "file:///tmp/photo.jpg",
};

function makeClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "store_item_requests");
      return {
        insert(payload) {
          assert.deepEqual(payload, { ...input, status: "pending" });
          return {
            select(columns) {
              assert.equal(columns, "*");
              return {
                async single() {
                  return { data, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("申請内容をpending状態で保存し、作成された申請を返す", async () => {
  const created = { id: "req-1", ...input, status: "pending", created_at: "2026-09-04T00:00:00Z", approved_by: null, approved_at: null };
  const client = makeClient({ data: created, error: null });

  const result = await createStoreItemRequest(input, client);

  assert.deepEqual(result, created);
});

test("保存に失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = makeClient({ data: null, error: new Error("db error") });

  await assert.rejects(
    () => createStoreItemRequest(input, client),
    /商品追加の申請に失敗しました。時間をおいて再度お試しください。/,
  );
});

test("fetchStoreItemRequestsは作成日時の新しい順で申請一覧を取得する", async () => {
  const rows = [{ id: "req-2" }, { id: "req-1" }];
  let calledTable;
  let calledOrder;
  const client = {
    from(table) {
      calledTable = table;
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            order(column, options) {
              calledOrder = { column, options };
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };

  const result = await fetchStoreItemRequests(client);

  assert.equal(calledTable, "store_item_requests");
  assert.deepEqual(calledOrder, { column: "created_at", options: { ascending: false } });
  assert.deepEqual(result, rows);
});

test("fetchStoreItemRequestsはエラーをそのまま投げる", async () => {
  const client = {
    from() {
      return { select: () => ({ order: () => Promise.resolve({ data: null, error: new Error("db error") }) }) };
    },
  };

  await assert.rejects(() => fetchStoreItemRequests(client), /db error/);
});

test("approveStoreItemRequestは正しい関数名・引数でRPCを呼び出す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return { data: null, error: null };
    },
  };

  await approveStoreItemRequest("req-1", "user-parent-1", 100, client);

  assert.deepEqual(called, {
    fn: "approve_store_item_request",
    args: { p_request_id: "req-1", p_approver_id: "user-parent-1", p_price: 100 },
  });
});

test("approveStoreItemRequestはRPCのエラーをそのまま投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("rpc failed") };
    },
  };

  await assert.rejects(() => approveStoreItemRequest("req-1", "user-parent-1", 100, client), /rpc failed/);
});

test("rejectStoreItemRequestは正しい関数名・引数でRPCを呼び出す", async () => {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return { data: null, error: null };
    },
  };

  await rejectStoreItemRequest("req-1", "user-parent-1", client);

  assert.deepEqual(called, {
    fn: "reject_store_item_request",
    args: { p_request_id: "req-1", p_approver_id: "user-parent-1" },
  });
});

test("rejectStoreItemRequestはRPCのエラーをそのまま投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("rpc failed") };
    },
  };

  await assert.rejects(() => rejectStoreItemRequest("req-1", "user-parent-1", client), /rpc failed/);
});
