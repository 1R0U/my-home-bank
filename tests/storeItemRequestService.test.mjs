import assert from "node:assert/strict";
import test from "node:test";
import { createStoreItemRequest } from "../lib/storeItemRequestService.ts";

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
