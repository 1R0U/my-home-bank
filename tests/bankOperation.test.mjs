import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingBankOperation, createBankOperationId, loadPendingBankOperation, savePendingBankOperation } from "../lib/bankOperation.ts";
import { isUuid } from "../lib/uuid.ts";

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
  await clearPendingBankOperation("user-2", storage);
  assert.deepEqual(await loadPendingBankOperation("user-1", storage), operation);
  await clearPendingBankOperation("user-1", storage);
  assert.equal(await loadPendingBankOperation("user-1", storage), null);
});
test("壊れた保存記録を無視して新しい操作を始めない", async () => {
  for (const value of ["not-json", "null", JSON.stringify({ ...operation, userId: "user-2" }),
    JSON.stringify({ ...operation, operationId: "bad" }), JSON.stringify({ ...operation, amount: -1 })]) {
    const storage = memoryStorage();
    storage.values.set("bank-pending-operation:v1:user-1", value);
    await assert.rejects(() => loadPendingBankOperation("user-1", storage));
  }
});
test("保存・読み込み・削除の失敗を呼び出し元へ返す", async () => {
  const storage = {
    async getItem() { throw new Error("読み込み失敗"); },
    async setItem() { throw new Error("保存失敗"); },
    async removeItem() { throw new Error("削除失敗"); },
  };
  await assert.rejects(() => savePendingBankOperation(operation, storage), /保存失敗/);
  await assert.rejects(() => loadPendingBankOperation("user-1", storage), /読み込み失敗/);
  await assert.rejects(() => clearPendingBankOperation("user-1", storage), /削除失敗/);
});
