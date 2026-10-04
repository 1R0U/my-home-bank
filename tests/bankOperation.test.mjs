import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingBankOperation, CorruptPendingBankOperationError, createBankOperationId,
  discardCorruptPendingBankOperation, loadPendingBankOperation, savePendingBankOperation } from "../lib/bankOperation.ts";
import { isUuid } from "../lib/uuid.ts";

/** 再起動後の復元と画面間の競合を再現するストレージ。 */
function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}
const operation = { userId: "user-1", operationId: "19000000-0000-4000-8000-000000000001", kind: "deposit", amount: 80 };

test("操作IDはUUID形式で、別操作には別のIDを生成する", () => {
  const ids = Array.from({ length: 1000 }, createBankOperationId);
  assert.ok(ids.every(isUuid));
  assert.equal(new Set(ids).size, ids.length);
});
test("再起動後も同じIDと入力を復元し、他の利用者には渡さない", async () => {
  const storage = memoryStorage();
  await savePendingBankOperation(operation, storage);
  assert.deepEqual(await loadPendingBankOperation("user-1", storage), operation);
  assert.equal(await loadPendingBankOperation("user-2", storage), null);
  await clearPendingBankOperation("user-2", operation.operationId, storage);
  assert.deepEqual(await loadPendingBankOperation("user-1", storage), operation);
  await clearPendingBankOperation("user-1", operation.operationId, storage);
  assert.equal(await loadPendingBankOperation("user-1", storage), null);
});
test("壊れた保存記録を無視して新しい操作を始めない", async () => {
  for (const value of ["not-json", "null", JSON.stringify({ ...operation, userId: "user-2" }),
    JSON.stringify({ ...operation, operationId: "bad" }), JSON.stringify({ ...operation, amount: -1 })]) {
    const storage = memoryStorage();
    storage.values.set("bank-pending-operation:v1:user-1", value);
    await assert.rejects(() => loadPendingBankOperation("user-1", storage), CorruptPendingBankOperationError);
    assert.equal(storage.values.get("bank-pending-operation:v1:user-1"), value);
  }
});

test("明示的な解除はJSON・形式が壊れた記録だけを削除し、新しい操作を保存できる", async () => {
  for (const value of ["not-json", "null", JSON.stringify({ ...operation, userId: "user-2" }),
    JSON.stringify({ ...operation, operationId: "bad" }), JSON.stringify({ ...operation, amount: -1 })]) {
    const storage = memoryStorage();
    storage.values.set("bank-pending-operation:v1:user-1", value);
    await discardCorruptPendingBankOperation(operation.userId, storage);
    assert.equal(await loadPendingBankOperation(operation.userId, storage), null);
    await savePendingBankOperation(operation, storage);
    assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), operation);
  }
});

test("破損解除は正常な未確認操作や他の利用者の記録を削除しない", async () => {
  const storage = memoryStorage();
  await savePendingBankOperation(operation, storage);
  await discardCorruptPendingBankOperation(operation.userId, storage);
  await discardCorruptPendingBankOperation("user-2", storage);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), operation);
});

test("破損解除で読み取り・削除に失敗したら、記録を保護して失敗を返す", async () => {
  let removes = 0;
  const storage = {
    async getItem() { throw new Error("読み込み失敗"); },
    async removeItem() { removes++; throw new Error("削除失敗"); },
  };
  await assert.rejects(() => discardCorruptPendingBankOperation(operation.userId, storage), /読み込み失敗/);
  assert.equal(removes, 0);
  await assert.rejects(() => discardCorruptPendingBankOperation(operation.userId,
    { ...storage, async getItem() { return "broken"; } }), /削除失敗/);
  assert.equal(removes, 1);
});

test("破損の照合と削除の間に新しい保存を割り込ませず、正常な操作を残す", async () => {
  const storage = memoryStorage();
  storage.values.set("bank-pending-operation:v1:user-1", "broken");
  let release;
  let notifyRead;
  const gate = new Promise((resolve) => { release = resolve; });
  const readStarted = new Promise((resolve) => { notifyRead = resolve; });
  const originalGetItem = storage.getItem;
  let holdRead = true;
  storage.getItem = async (key) => {
    if (holdRead) {
      holdRead = false;
      notifyRead();
      await gate;
    }
    return originalGetItem(key);
  };
  const discarding = discardCorruptPendingBankOperation(operation.userId, storage);
  await readStarted;
  const saving = savePendingBankOperation(operation, storage);
  release();
  await Promise.all([discarding, saving]);
  // 古い破損画面で再度解除しても、新しく保存された記録を削除しない。
  await discardCorruptPendingBankOperation(operation.userId, storage);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), operation);
});
test("保存・読み込み・削除の失敗を呼び出し元へ返す", async () => {
  const storage = {
    async getItem() { throw new Error("読み込み失敗"); },
    async setItem() { throw new Error("保存失敗"); },
    async removeItem() { throw new Error("削除失敗"); },
  };
  await assert.rejects(() => savePendingBankOperation(operation, { ...storage, async getItem() { return null; } }), /保存失敗/);
  await assert.rejects(() => loadPendingBankOperation("user-1", storage), /読み込み失敗/);
  await assert.rejects(() => clearPendingBankOperation("user-1", operation.operationId, { ...storage, async getItem() { return JSON.stringify(operation); } }), /削除失敗/);
});

test("古い操作Aの遅い完了は、新しい未確認操作Bを消さない", async () => {
  const storage = memoryStorage();
  const next = { ...operation, operationId: "19000000-0000-4000-8000-000000000002", amount: 40 };
  await savePendingBankOperation(operation, storage);
  // 新しい画面がAの結果を確認した後、Bを送信し、Bの応答が失われた場面。
  await clearPendingBankOperation(operation.userId, operation.operationId, storage);
  await savePendingBankOperation(next, storage);
  // 元の画面にAの成功応答が遅れて届く。
  await clearPendingBankOperation(operation.userId, operation.operationId, storage);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), next);
  await assert.rejects(() => savePendingBankOperation(operation, storage), /確認待ち/);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), next);
});

test("2画面が別IDを同時に保存しても、確認待ちの操作を上書きしない", async () => {
  const storage = memoryStorage();
  const next = { ...operation, operationId: "19000000-0000-4000-8000-000000000003" };
  const results = await Promise.allSettled([
    savePendingBankOperation(operation, storage), savePendingBankOperation(next, storage),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), operation);
});

test("削除の照合中に新しい保存が来ても、照合と削除の間へ割り込ませない", async () => {
  const storage = memoryStorage();
  const next = { ...operation, operationId: "19000000-0000-4000-8000-000000000004" };
  await savePendingBankOperation(operation, storage);
  let release;
  let notifyRead;
  const gate = new Promise((resolve) => { release = resolve; });
  const readStarted = new Promise((resolve) => { notifyRead = resolve; });
  const originalGetItem = storage.getItem;
  let holdRead = true;
  storage.getItem = async (key) => {
    if (holdRead) {
      holdRead = false;
      notifyRead();
      await gate;
    }
    return originalGetItem(key);
  };
  const clearing = clearPendingBankOperation(operation.userId, operation.operationId, storage);
  await readStarted;
  const saving = savePendingBankOperation(next, storage);
  release();
  await Promise.all([clearing, saving]);
  assert.deepEqual(await loadPendingBankOperation(operation.userId, storage), next);
});
