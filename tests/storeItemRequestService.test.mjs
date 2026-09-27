import assert from "node:assert/strict";
import test from "node:test";
import {
  approveStoreItemRequest,
  createStoreItemRequest,
  fetchStoreItemRequests,
  rejectStoreItemRequest,
  StoreItemRequestAlreadyProcessedError,
} from "../lib/storeItemRequestService.ts";

const input = {
  family_id: "family-1",
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

test("fetchStoreItemRequestsはfamily_idとpendingで絞り、作成日時の新しい順で取得する", async () => {
  const rows = [{ id: "req-2" }, { id: "req-1" }];
  let calledTable;
  let calledEqCalls = [];
  let calledOrder;
  const client = {
    from(table) {
      calledTable = table;
      return {
        select(columns) {
          assert.equal(columns, "*");
          const builder = {
            eq(column, value) {
              calledEqCalls.push({ column, value });
              return builder;
            },
            order(column, options) {
              calledOrder = { column, options };
              return Promise.resolve({ data: rows, error: null });
            },
          };
          return builder;
        },
      };
    },
  };

  const result = await fetchStoreItemRequests("family-1", client);

  assert.equal(calledTable, "store_item_requests");
  assert.deepEqual(calledEqCalls, [
    { column: "status", value: "pending" },
    { column: "family_id", value: "family-1" },
  ]);
  assert.deepEqual(calledOrder, { column: "created_at", options: { ascending: false } });
  assert.deepEqual(result, rows);
});

test("fetchStoreItemRequestsは失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = {
    from() {
      const builder = {
        eq: () => builder,
        order: () => Promise.resolve({ data: null, error: new Error("db error") }),
      };
      return { select: () => builder };
    },
  };

  await assert.rejects(
    () => fetchStoreItemRequests("family-1", client),
    /商品追加申請の取得に失敗しました。時間をおいて再度お試しください。/,
  );
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

test("approveStoreItemRequestは失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("rpc failed") };
    },
  };

  await assert.rejects(
    () => approveStoreItemRequest("req-1", "user-parent-1", 100, client),
    /申請の承認に失敗しました。時間をおいて再度お試しください。/,
  );
});

test("approveStoreItemRequestは処理済みの申請への操作を、日本語の分かりやすいメッセージにする", async () => {
  // approve_store_item_request（DB関数）は pending でない申請にこのSQLSTATEで例外を投げる
  // （supabase/migrations/20260927000000_approve_store_item_request.sql の errcode = 'ST0AP'）。
  // 親が2人いて片方が先に処理した直後にもう片方がボタンを押すと普通に起きるケース
  const client = {
    async rpc() {
      return {
        data: null,
        error: { message: "対象の申請が見つからないか、すでに処理されています", code: "ST0AP" },
      };
    },
  };

  await assert.rejects(
    () => approveStoreItemRequest("req-1", "user-parent-1", 100, client),
    /この申請はすでに処理されています。一覧を更新します。/,
  );
});

test("approveStoreItemRequestは処理済みの申請への操作で、他の失敗と区別できるエラー型を投げる", async () => {
  // 呼び出し側（StoreItemRequestDetail）がこの型を見てエラー表示せず一覧を自動更新する
  const client = {
    async rpc() {
      return {
        data: null,
        error: { message: "対象の申請が見つからないか、すでに処理されています", code: "ST0AP" },
      };
    },
  };

  await assert.rejects(
    () => approveStoreItemRequest("req-1", "user-parent-1", 100, client),
    StoreItemRequestAlreadyProcessedError,
  );
});

test("approveStoreItemRequestは、messageだけでcodeを持たないエラーでは処理済みと判定しない", async () => {
  // codeでの判定に切り替えたため（1R0Uさんレビュー指摘）、メッセージが似ていても
  // codeが無ければ／一致しなければ汎用エラーになることを確認する。
  const client = {
    async rpc() {
      return {
        data: null,
        error: new Error("対象の申請が見つからないか、すでに処理されています"),
      };
    },
  };

  await assert.rejects(
    () => approveStoreItemRequest("req-1", "user-parent-1", 100, client),
    (error) => {
      assert.ok(!(error instanceof StoreItemRequestAlreadyProcessedError));
      assert.match(error.message, /申請の承認に失敗しました。時間をおいて再度お試しください。/);
      return true;
    },
  );
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

test("rejectStoreItemRequestは失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = {
    async rpc() {
      return { data: null, error: new Error("rpc failed") };
    },
  };

  await assert.rejects(
    () => rejectStoreItemRequest("req-1", "user-parent-1", client),
    /申請の拒否に失敗しました。時間をおいて再度お試しください。/,
  );
});

test("rejectStoreItemRequestは処理済みの申請への操作を、日本語の分かりやすいメッセージにする", async () => {
  const client = {
    async rpc() {
      return {
        data: null,
        error: { message: "対象の申請が見つからないか、すでに処理されています", code: "ST0AP" },
      };
    },
  };

  await assert.rejects(
    () => rejectStoreItemRequest("req-1", "user-parent-1", client),
    /この申請はすでに処理されています。一覧を更新します。/,
  );
});
