import { isUuid } from "./uuid.ts";

export type PendingBankOperation = {
  operationId: string;
  userId: string;
  kind: "deposit" | "withdraw";
  amount: number;
};
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** 端末のUUID生成を使い、未対応の環境でもUUID形式の操作IDを作る。 */
export function createBankOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 3) | 8).toString(16);
  });
}

const storageKey = (userId: string) => `bank-pending-operation:v1:${userId}`;
async function resolveStorage(storage?: Storage): Promise<Storage> {
  return storage ?? (await import("@react-native-async-storage/async-storage")).default;
}

/** 保存済みの未確認操作を復元する。壊れた記録を捨てて新規操作へ進めない。 */
export async function loadPendingBankOperation(userId: string, storage?: Storage): Promise<PendingBankOperation | null> {
  const value = await (await resolveStorage(storage)).getItem(storageKey(userId));
  if (value === null) return null;
  const operation = JSON.parse(value) as PendingBankOperation;
  if (!operation || operation.userId !== userId || !isUuid(operation.operationId)
      || !["deposit", "withdraw"].includes(operation.kind)
      || !Number.isSafeInteger(operation.amount) || operation.amount <= 0) {
    throw new Error("確認待ちの銀行操作を読み込めませんでした");
  }
  return operation;
}

/** RPC送信前に保存する。再起動後も同じ内容とIDで確認できる。 */
export async function savePendingBankOperation(operation: PendingBankOperation, storage?: Storage): Promise<void> {
  await (await resolveStorage(storage)).setItem(storageKey(operation.userId), JSON.stringify(operation));
}

export async function clearPendingBankOperation(userId: string, storage?: Storage): Promise<void> {
  await (await resolveStorage(storage)).removeItem(storageKey(userId));
}
