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

/** 保存記録の破損を、ストレージ自体の読み取り失敗と区別する。 */
export class CorruptPendingBankOperationError extends Error {
  constructor() {
    super("確認待ちの銀行操作の保存記録が壊れています");
    this.name = "CorruptPendingBankOperationError";
  }
}

/** 端末のUUID生成を使い、未対応の環境でもUUID形式の操作IDを作る。 */
export function createBankOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 3) | 8).toString(16);
  });
}

/** 同じ本人の保存・復元・削除を、重なった画面の間でも順番に実行する。 */
const storageActions = new Map<string, Promise<void>>();
function withStorageLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const previous = storageActions.get(userId) ?? Promise.resolve();
  const next = previous.then(action);
  const settled = next.then(() => undefined, () => undefined);
  storageActions.set(userId, settled);
  void settled.then(() => {
    if (storageActions.get(userId) === settled) storageActions.delete(userId);
  });
  return next;
}

const storageKey = (userId: string) => `bank-pending-operation:v1:${userId}`;
/** 純粋なロジックテストでは端末ストレージを読み込まない。 */
async function resolveStorage(storage?: Storage): Promise<Storage> {
  return storage ?? (await import("@react-native-async-storage/async-storage")).default;
}

/** 保存済みの未確認操作を復元する。壊れた記録を捨てて新規操作へ進めない。 */
export async function loadPendingBankOperation(userId: string, storage?: Storage): Promise<PendingBankOperation | null> {
  return withStorageLock(userId, async () => readPendingBankOperation(userId, await resolveStorage(storage)));
}

/** 呼び出し元がストレージのロックを持った状態で記録を検証する。 */
async function readPendingBankOperation(userId: string, storage: Storage): Promise<PendingBankOperation | null> {
  const value = await storage.getItem(storageKey(userId));
  if (value === null) return null;
  let operation: PendingBankOperation;
  try {
    operation = JSON.parse(value) as PendingBankOperation;
  } catch {
    throw new CorruptPendingBankOperationError();
  }
  if (!operation || operation.userId !== userId || !isUuid(operation.operationId)
      || !["deposit", "withdraw"].includes(operation.kind)
      || !Number.isSafeInteger(operation.amount) || operation.amount <= 0) {
    throw new CorruptPendingBankOperationError();
  }
  return operation;
}

/** RPC送信前に保存する。再起動後も同じ内容とIDで確認できる。 */
export async function savePendingBankOperation(operation: PendingBankOperation, storage?: Storage): Promise<void> {
  return withStorageLock(operation.userId, async () => {
    const resolved = await resolveStorage(storage);
    const existing = await readPendingBankOperation(operation.userId, resolved);
    if (existing && (existing.operationId !== operation.operationId
        || existing.kind !== operation.kind || existing.amount !== operation.amount)) {
      throw new Error("別の銀行操作の結果が確認待ちです");
    }
    await resolved.setItem(storageKey(operation.userId), JSON.stringify(operation));
  });
}

/** 古い画面の完了で、新しい操作の確認待ちIDを消さない。 */
export async function clearPendingBankOperation(userId: string, operationId: string, storage?: Storage): Promise<void> {
  return withStorageLock(userId, async () => {
    const resolved = await resolveStorage(storage);
    const existing = await readPendingBankOperation(userId, resolved);
    if (existing?.operationId === operationId) await resolved.removeItem(storageKey(userId));
  });
}

/** 利用者の明示的な解除時だけ破損記録を削除する。正常な記録と読み取り失敗は保護する。 */
export async function discardCorruptPendingBankOperation(userId: string, storage?: Storage): Promise<void> {
  return withStorageLock(userId, async () => {
    const resolved = await resolveStorage(storage);
    try {
      await readPendingBankOperation(userId, resolved);
    } catch (error) {
      if (!(error instanceof CorruptPendingBankOperationError)) throw error;
      await resolved.removeItem(storageKey(userId));
    }
  });
}
