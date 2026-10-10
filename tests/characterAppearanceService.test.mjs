import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchCharacterPalette,
  fetchCharacterType,
  savePaletteChanges,
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
      assert.equal(table, "character_palettes");
      return {
        select(columns) {
          assert.equal(columns, "accent_color, hair_color, skin_color");
          return {
            eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              return {
                eq(typeColumn, typeValue) {
                  assert.equal(typeColumn, "character_type");
                  assert.equal(typeValue, "cat");
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
    },
  };
}

test("fetchCharacterPaletteは選んでいる色を返す", async () => {
  const client = makePaletteFetchClient({
    data: { accent_color: "#2f7a2a", hair_color: null, skin_color: "#4fae3f" },
    error: null,
  });
  assert.deepEqual(await fetchCharacterPalette("user-1", "cat", client), {
    accent: "#2f7a2a",
    skin: "#4fae3f",
  });
});

test("fetchCharacterPaletteはまだ選んでいない人（行が無い）に空を返す", async () => {
  const client = makePaletteFetchClient({ data: null, error: null });
  assert.deepEqual(await fetchCharacterPalette("user-1", "cat", client), {});
});

test("fetchCharacterPaletteは候補に無い値の枠だけ落とす", async () => {
  // CHECK制約は形式しか見ないため、候補が減った場合などに備えて防御する
  const client = makePaletteFetchClient({
    data: { accent_color: "#123456", hair_color: null, skin_color: "#4fae3f" },
    error: null,
  });
  assert.deepEqual(await fetchCharacterPalette("user-1", "cat", client), { skin: "#4fae3f" });
});

test("fetchCharacterPaletteは失敗したらエラーを投げる", async () => {
  const client = makePaletteFetchClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchCharacterPalette("user-1", "cat", client), /boom/);
});

/** upsert に渡されたものを覚えておくクライアント */
function makePaletteSaveClient({ error }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "character_palettes");
      return {
        upsert(payload, options) {
          calls.push({ options, payload });
          return Promise.resolve({ error });
        },
      };
    },
  };
}

test("savePaletteChangesは変えた枠だけを1回のupsertで保存する（他の枠を消さない）", async () => {
  const client = makePaletteSaveClient({ error: null });
  await savePaletteChanges(
    "user-1",
    "cat",
    [
      { color: "#4a90e2", slot: "skin" },
      { color: "#e74c3c", slot: "accent" },
    ],
    client,
  );

  assert.equal(client.calls.length, 1);
  const { options, payload } = client.calls[0];
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.character_type, "cat");
  assert.equal(payload.skin_color, "#4a90e2");
  assert.equal(payload.accent_color, "#e74c3c");
  assert.equal("hair_color" in payload, false, "変えていない枠は送らない");
  assert.equal(typeof payload.updated_at, "string");
  assert.deepEqual(options, { onConflict: "user_id,character_type" });
});

test("savePaletteChangesは「もとのいろ」（null）を列のNULLとして保存する", async () => {
  const client = makePaletteSaveClient({ error: null });
  await savePaletteChanges("user-1", "cat", [{ color: null, slot: "skin" }], client);

  const { payload } = client.calls[0];
  assert.equal(payload.skin_color, null);
  assert.equal("accent_color" in payload, false, "変えていない枠は送らない");
});

test("savePaletteChangesは変更が無ければ何も送らない", async () => {
  const client = makePaletteSaveClient({ error: null });
  await savePaletteChanges("user-1", "cat", [], client);
  assert.equal(client.calls.length, 0);
});

test("savePaletteChangesは失敗したらエラーを投げる", async () => {
  const client = makePaletteSaveClient({ error: new Error("boom") });
  await assert.rejects(
    () => savePaletteChanges("user-1", "cat", [{ color: "#4fae3f", slot: "skin" }], client),
    /boom/,
  );
});

test("同じ利用者でも種類ごとに色を保存し、片方を戻しても他の種類の色は残る", async () => {
  const rows = new Map();
  const client = {
    from(table) {
      assert.equal(table, "character_palettes");
      return {
        async upsert(payload, options) {
          assert.deepEqual(options, { onConflict: "user_id,character_type" });
          const key = `${payload.user_id}:${payload.character_type}`;
          rows.set(key, { ...rows.get(key), ...payload });
          return { error: null };
        },
        select() {
          const filters = {};
          const query = {
            eq(column, value) {
              filters[column] = value;
              return query;
            },
            async maybeSingle() {
              return { data: rows.get(`${filters.user_id}:${filters.character_type}`) ?? null, error: null };
            },
          };
          return query;
        },
      };
    },
  };

  await savePaletteChanges("user-1", "frog", [{ slot: "skin", color: "#4fae3f" }], client);
  await savePaletteChanges("user-1", "cat", [{ slot: "skin", color: "#f2a1c2" }], client);
  assert.deepEqual(await fetchCharacterPalette("user-1", "frog", client), { skin: "#4fae3f" });
  assert.deepEqual(await fetchCharacterPalette("user-1", "cat", client), { skin: "#f2a1c2" });
  assert.deepEqual(await fetchCharacterPalette("user-1", "rabbit", client), {});

  await savePaletteChanges("user-1", "cat", [{ slot: "skin", color: null }], client);
  assert.deepEqual(await fetchCharacterPalette("user-1", "cat", client), {});
  assert.deepEqual(await fetchCharacterPalette("user-1", "frog", client), { skin: "#4fae3f" });
});
