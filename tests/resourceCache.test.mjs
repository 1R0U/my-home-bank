import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { markDataChanged } from "../lib/dataFreshness.ts";
import {
  RESOURCE_FRESH_MS,
  clearResourceCache,
  ensureResourceFresh,
  fetchResource,
  getResourceEntry,
  isResourceFresh,
  serializeResourceKey,
  subscribeResource,
  updateResourceData,
} from "../lib/resourceCache.ts";

// Issue #399: 取得結果をキーごとに1か所で持つキャッシュ

const KEY = serializeResourceKey(["quests", "family-1"]);
const originalWarn = console.warn;

beforeEach(() => {
  clearResourceCache();
  console.warn = () => {};
});

/** 外から解決できる Promise を作る。 */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

test("取得に成功すると、データと取得時刻を持つ", async () => {
  await fetchResource(KEY, async () => ["a"], "失敗", 1000);

  const entry = getResourceEntry(KEY);
  assert.deepEqual(entry.data, ["a"]);
  assert.equal(entry.hasData, true);
  assert.equal(entry.fetching, false);
  assert.equal(entry.fetchedAt, 1000);
});

test("null を返す取得も「取得済み」として扱う（口座なしなど）", async () => {
  await fetchResource(KEY, async () => null, "失敗");
  assert.equal(getResourceEntry(KEY).hasData, true);
  assert.equal(getResourceEntry(KEY).data, null);
});

test("先に始めた取得が後から終わっても、新しい結果を上書きしない", async () => {
  const first = deferred();
  const firstDone = fetchResource(KEY, () => first.promise, "失敗");
  await fetchResource(KEY, async () => ["new"], "失敗");

  first.resolve(["old"]);
  await firstDone;

  assert.deepEqual(getResourceEntry(KEY).data, ["new"]);
});

test("失敗しても前回のデータは残し、固定の文言をエラーにする", async () => {
  await fetchResource(KEY, async () => ["a"], "失敗");
  await fetchResource(KEY, async () => {
    throw new Error("生のエラー");
  }, "取得できませんでした");

  const entry = getResourceEntry(KEY);
  assert.deepEqual(entry.data, ["a"]);
  assert.equal(entry.error, "取得できませんでした");
});

test("同期的に例外を投げる取得も、失敗として扱う", async () => {
  await fetchResource(KEY, () => {
    throw new Error("同期の例外");
  }, "失敗");
  assert.equal(getResourceEntry(KEY).error, "失敗");
});

test("取得し直すとエラーは消える", async () => {
  await fetchResource(KEY, async () => {
    throw new Error("x");
  }, "失敗");
  const pending = deferred();
  const done = fetchResource(KEY, () => pending.promise, "失敗");
  assert.equal(getResourceEntry(KEY).error, null);
  pending.resolve([]);
  await done;
});

test("直近に取ったばかりなら、取り直さない", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [];
  };
  await ensureResourceFresh(KEY, fetcher, "失敗", 1000);
  assert.equal(ensureResourceFresh(KEY, fetcher, "失敗", 1000 + RESOURCE_FRESH_MS - 1), undefined);
  assert.equal(calls, 1);

  await ensureResourceFresh(KEY, fetcher, "失敗", 1000 + RESOURCE_FRESH_MS);
  assert.equal(calls, 2);
});

test("この端末で書き込みがあれば、時間内でも取り直す", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [];
  };
  await ensureResourceFresh(KEY, fetcher, "失敗", 1000);
  markDataChanged();
  await ensureResourceFresh(KEY, fetcher, "失敗", 1001);
  assert.equal(calls, 2);
});

test("同じキーを取得中なら、重ねて取得しない（画面どうしで共有する）", () => {
  const pending = deferred();
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return pending.promise;
  };
  ensureResourceFresh(KEY, fetcher, "失敗", 1000);
  assert.equal(ensureResourceFresh(KEY, fetcher, "失敗", 1001), undefined);
  assert.equal(calls, 1);
  pending.resolve([]);
});

test("失敗したままのものは、時間内でも取り直す", async () => {
  await fetchResource(KEY, async () => {
    throw new Error("x");
  }, "失敗", 1000);
  assert.equal(isResourceFresh(getResourceEntry(KEY), 1001, 0), false);
});

test("キャッシュを消す前に始まった取得の応答は捨てる（ログアウト後に前の人のデータを戻さない）", async () => {
  const pending = deferred();
  const done = fetchResource(KEY, () => pending.promise, "失敗");
  clearResourceCache();
  pending.resolve(["前の人"]);
  await done;
  assert.equal(getResourceEntry(KEY), undefined);
});

test("取得済みのデータは取り直さずに書き換えられる。未取得のキーには何もしない", async () => {
  updateResourceData(KEY, () => ["x"]);
  assert.equal(getResourceEntry(KEY), undefined);

  await fetchResource(KEY, async () => [1, 2], "失敗");
  updateResourceData(KEY, (data) => data.filter((n) => n !== 1));
  assert.deepEqual(getResourceEntry(KEY).data, [2]);
});

test("状態が変わると、登録した関数が呼ばれる。外した後は呼ばれない", async () => {
  let calls = 0;
  const unsubscribe = subscribeResource(KEY, () => {
    calls += 1;
  });
  await fetchResource(KEY, async () => [], "失敗");
  assert.equal(calls, 2); // 取得開始と完了
  unsubscribe();
  await fetchResource(KEY, async () => [], "失敗");
  assert.equal(calls, 2);
});

test.after(() => {
  console.warn = originalWarn;
});
