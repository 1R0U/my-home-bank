import assert from "node:assert/strict";
import test from "node:test";
import { fetchCharacterType, saveCharacterType } from "../lib/characterAppearanceService.ts";

function makeFetchClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "character_appearances");
      return {
        select(columns) {
          assert.equal(columns, "character_type");
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

test("fetchCharacterTypeは選んでいる種類を返す", async () => {
  const client = makeFetchClient({ data: { character_type: "cat" }, error: null });
  assert.equal(await fetchCharacterType("user-1", client), "cat");
});

test("fetchCharacterTypeはまだ選んでいない人（行が無い）に既定値（frog）を返す", async () => {
  const client = makeFetchClient({ data: null, error: null });
  assert.equal(await fetchCharacterType("user-1", client), "frog");
});

test("fetchCharacterTypeはカタログに無い値なら既定値（frog）を返す", async () => {
  // CHECK制約があるため通常は起きないが、念のため防御する
  const client = makeFetchClient({ data: { character_type: "dragon" }, error: null });
  assert.equal(await fetchCharacterType("user-1", client), "frog");
});

test("fetchCharacterTypeは失敗したらエラーを投げる", async () => {
  const client = makeFetchClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchCharacterType("user-1", client), /boom/);
});

function makeSaveClient({ error }) {
  return {
    from(table) {
      assert.equal(table, "character_appearances");
      return {
        upsert(payload, options) {
          assert.equal(payload.user_id, "user-1");
          assert.equal(payload.character_type, "hamster");
          assert.equal(typeof payload.updated_at, "string");
          assert.deepEqual(options, { onConflict: "user_id" });
          return Promise.resolve({ error });
        },
      };
    },
  };
}

test("saveCharacterTypeは選んだ種類をupsertする", async () => {
  const client = makeSaveClient({ error: null });
  await saveCharacterType("user-1", "hamster", client);
});

test("saveCharacterTypeは失敗したらエラーを投げる", async () => {
  const client = makeSaveClient({ error: new Error("boom") });
  await assert.rejects(() => saveCharacterType("user-1", "hamster", client), /boom/);
});
