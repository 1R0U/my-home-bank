import assert from "node:assert/strict";
import test from "node:test";
import { createTaskReport } from "../lib/taskReportService.ts";

const input = {
  reported_by: "user-child-1",
  title: "食器洗い",
  description: "夕飯の後、自分から食器を洗った",
};

function makeClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "task_reports");
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

test("報告内容をpending状態で保存し、作成された報告を返す", async () => {
  const created = { id: "report-1", ...input, status: "pending", created_at: "2026-09-11T00:00:00Z", approved_by: null, approved_at: null };
  const client = makeClient({ data: created, error: null });

  const result = await createTaskReport(input, client);

  assert.deepEqual(result, created);
});

test("保存に失敗したら日本語メッセージのエラーを投げる", async () => {
  const client = makeClient({ data: null, error: new Error("db error") });

  await assert.rejects(
    () => createTaskReport(input, client),
    /タスクの報告に失敗しました。時間をおいて再度お試しください。/,
  );
});
