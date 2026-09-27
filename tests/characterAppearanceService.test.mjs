import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchCharacterPalette,
  fetchCharacterType,
  savePaletteColor,
  saveCharacterType,
} from "../lib/characterAppearanceService.ts";

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

// --- 色（Issue #253） ---

function makePaletteFetchClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "character_appearances");
      return {
        select(columns) {
          assert.equal(columns, "accent_color, hair_color, skin_color");
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

test("fetchCharacterPaletteは選んでいる色を返す", async () => {
  const client = makePaletteFetchClient({
    data: { accent_color: "#2f7a2a", hair_color: null, skin_color: "#4fae3f" },
    error: null,
  });
  assert.deepEqual(await fetchCharacterPalette("user-1", client), {
    accent: "#2f7a2a",
    skin: "#4fae3f",
  });
});

test("fetchCharacterPaletteはまだ選んでいない人（行が無い）に空を返す", async () => {
  const client = makePaletteFetchClient({ data: null, error: null });
  assert.deepEqual(await fetchCharacterPalette("user-1", client), {});
});

test("fetchCharacterPaletteは候補に無い値の枠だけ落とす", async () => {
  // CHECK制約は形式しか見ないため、候補が減った場合などに備えて防御する
  const client = makePaletteFetchClient({
    data: { accent_color: "#123456", hair_color: null, skin_color: "#4fae3f" },
    error: null,
  });
  assert.deepEqual(await fetchCharacterPalette("user-1", client), { skin: "#4fae3f" });
});

test("fetchCharacterPaletteは失敗したらエラーを投げる", async () => {
  const client = makePaletteFetchClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchCharacterPalette("user-1", client), /boom/);
});

function makePaletteSaveClient({ error }) {
  return {
    from(table) {
      assert.equal(table, "character_appearances");
      return {
        upsert(payload, options) {
          assert.equal(payload.user_id, "user-1");
          assert.equal(payload.skin_color, "#4fae3f");
          assert.equal(payload.accent_color, undefined, "指定していない枠は送らない");
          assert.equal(typeof payload.updated_at, "string");
          assert.deepEqual(options, { onConflict: "user_id" });
          return Promise.resolve({ error });
        },
      };
    },
  };
}

test("savePaletteColorは指定した枠だけをupsertする（他の枠を消さない）", async () => {
  const client = makePaletteSaveClient({ error: null });
  await savePaletteColor("user-1", "skin", "#4fae3f", client);
});

test("savePaletteColorは失敗したらエラーを投げる", async () => {
  const client = makePaletteSaveClient({ error: new Error("boom") });
  await assert.rejects(() => savePaletteColor("user-1", "skin", "#4fae3f", client), /boom/);
});
