import assert from "node:assert/strict";
import test from "node:test";
import { fetchFamilyTown } from "../lib/familyTownService.ts";

/**
 * 呼ばれた絞り込みを記録しつつ、テーブルごとに決めた結果を返すクライアント。
 * どの絞り込みの後でも await できるよう、各段で then を持たせる。
 */
function makeClient(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { filters: [], table };
      calls.push(call);
      const chain = {
        eq(column, value) {
          call.filters.push(["eq", column, value]);
          return chain;
        },
        in(column, values) {
          call.filters.push(["in", column, values]);
          return chain;
        },
        order(column, options) {
          call.filters.push(["order", column, options]);
          return chain;
        },
        select(columns) {
          call.columns = columns;
          return chain;
        },
        then(resolve, reject) {
          return Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

test("fetchFamilyTownは家族を登録順に取り、見た目と状況をまとめる", async () => {
  const client = makeClient({
    character_appearances: {
      data: [{ accent_color: "#4a90e2", hair_color: null, skin_color: null, user_id: "kid" }],
      error: null,
    },
    equipped_items: { data: [{ asset_id: "wearable-hat", slot: "head", user_id: "kid" }], error: null },
    quests: { data: [{ assigned_to: "kid", status: "pending" }], error: null },
    users: {
      data: [
        { balance: 300, id: "mom", name: "ママ", role: "parent" },
        { balance: 40, id: "kid", name: "たろう", role: "child" },
      ],
      error: null,
    },
  });

  const result = await fetchFamilyTown("family-1", client);

  assert.equal(result.familyPendingQuestCount, 1);
  assert.deepEqual(
    result.members.map((member) => member.id),
    ["mom", "kid"],
  );
  assert.deepEqual(result.members[1].palette, { accent: "#4a90e2" });
  assert.deepEqual(result.members[1].equipment, { head: "wearable-hat" });
  assert.equal(result.members[1].pendingQuestCount, 1);

  const users = client.calls.find((call) => call.table === "users");
  assert.deepEqual(users.filters, [
    ["eq", "family_id", "family-1"],
    ["order", "created_at", { ascending: true }],
  ]);
  for (const table of ["character_appearances", "equipped_items"]) {
    const call = client.calls.find((entry) => entry.table === table);
    assert.deepEqual(call.filters, [["in", "user_id", ["mom", "kid"]]], table);
  }
  const quests = client.calls.find((call) => call.table === "quests");
  assert.deepEqual(quests.filters, [
    ["eq", "family_id", "family-1"],
    ["in", "status", ["accepted", "pending"]],
  ]);
});

test("fetchFamilyTownは家族がいなければ、ほかのテーブルを読まない", async () => {
  const client = makeClient({ users: { data: [], error: null } });

  assert.deepEqual(await fetchFamilyTown("family-1", client), {
    familyPendingQuestCount: 0,
    members: [],
  });
  assert.deepEqual(
    client.calls.map((call) => call.table),
    ["users"],
  );
});

test("fetchFamilyTownは、どれかの取得に失敗したらエラーを投げる", async () => {
  const users = { data: [{ balance: 0, id: "kid", name: "たろう", role: "child" }], error: null };

  await assert.rejects(
    () => fetchFamilyTown("family-1", makeClient({ users: { data: null, error: new Error("users") } })),
    /users/,
  );
  await assert.rejects(
    () =>
      fetchFamilyTown(
        "family-1",
        makeClient({ equipped_items: { data: null, error: new Error("equipped") }, users }),
      ),
    /equipped/,
  );
  await assert.rejects(
    () =>
      fetchFamilyTown("family-1", makeClient({ quests: { data: null, error: new Error("quests") }, users })),
    /quests/,
  );
});
