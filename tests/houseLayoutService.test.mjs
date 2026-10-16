import assert from "node:assert/strict";
import test from "node:test";
import { fetchHouseLayout, saveHouseLayout } from "../lib/houseLayoutService.ts";

function makeFetchClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "house_layouts");
      return {
        select(columns) {
          assert.equal(columns, "closet_x, placed");
          return {
            eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              return {
                async maybeSingle() {
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

test("fetchHouseLayoutは保存してある配置を返す", async () => {
  const client = makeFetchClient({
    data: { closet_x: 0.4, placed: [{ floor: "ground", kind: "plant", x: 0.6 }] },
    error: null,
  });
  assert.deepEqual(await fetchHouseLayout("user-1", client), {
    closetX: 0.4,
    placed: [{ floor: "ground", kind: "plant", x: 0.6 }],
  });
});

test("fetchHouseLayoutはまだ保存していない人（行が無い）にnullを返す", async () => {
  const client = makeFetchClient({ data: null, error: null });
  assert.equal(await fetchHouseLayout("user-1", client), null);
});

test("fetchHouseLayoutは壊れた値（placedの不正な項目）を捨てて使える分だけ返す", async () => {
  const client = makeFetchClient({
    data: { closet_x: 0.4, placed: [{ floor: "ground", kind: "plant", x: 0.6 }, { floor: "unknown", kind: "sofa", x: 2 }] },
    error: null,
  });
  assert.deepEqual(await fetchHouseLayout("user-1", client), {
    closetX: 0.4,
    placed: [{ floor: "ground", kind: "plant", x: 0.6 }],
  });
});

test("fetchHouseLayoutは失敗したらエラーを投げる", async () => {
  const client = makeFetchClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchHouseLayout("user-1", client), /boom/);
});

function makeSaveClient({ error }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "house_layouts");
      return {
        upsert(payload, options) {
          calls.push({ options, payload });
          return Promise.resolve({ error });
        },
      };
    },
  };
}

test("saveHouseLayoutは配置をupsertする", async () => {
  const client = makeSaveClient({ error: null });
  await saveHouseLayout("user-1", { closetX: 0.5, placed: [{ floor: "upstairs", kind: "bed", x: 0.3 }] }, client);

  assert.equal(client.calls.length, 1);
  const { options, payload } = client.calls[0];
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.closet_x, 0.5);
  assert.deepEqual(payload.placed, [{ floor: "upstairs", kind: "bed", x: 0.3 }]);
  assert.equal(typeof payload.updated_at, "string");
  assert.deepEqual(options, { onConflict: "user_id" });
});

test("saveHouseLayoutは失敗したらエラーを投げる", async () => {
  const client = makeSaveClient({ error: new Error("boom") });
  await assert.rejects(
    () => saveHouseLayout("user-1", { closetX: 0.27, placed: [] }, client),
    /boom/,
  );
});
