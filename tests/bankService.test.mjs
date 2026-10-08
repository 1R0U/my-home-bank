import assert from "node:assert/strict";
import test from "node:test";
import { bankDeposit, bankWithdraw, fetchBankAccount } from "../lib/bankService.ts";

const operationId = "19000000-0000-4000-8000-000000000001";

/**
 * RPC を呼ぶ Supabase クライアントの代役を作る。
 * 呼ばれた関数名と引数を記録し、指定した戻り値をそのまま返す。
 */
function makeRpcClient(returnValue) {
  let called;
  const client = {
    async rpc(fn, args) {
      called = { fn, args };
      return returnValue;
    },
  };
  return { client, getCalled: () => called };
}

test("bankDepositは正しい関数名・引数でRPCを呼び出す", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });
  await bankDeposit("user-1", 100, operationId, client);
  assert.deepEqual(getCalled(), { fn: "bank_deposit", args: { p_user_id: "user-1", p_amount: 100, p_operation_id: operationId } });
});

test("bankWithdrawは正しい関数名・引数でRPCを呼び出す", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });
  await bankWithdraw("user-1", 50, operationId, client);
  assert.deepEqual(getCalled(), { fn: "bank_withdraw", args: { p_user_id: "user-1", p_amount: 50, p_operation_id: operationId } });
});

test("各操作は成功したら ok の Result を返す", async () => {
  const receipt = { operation_id: operationId, wallet_balance: 0, deposit_balance: 100, loan_balance: 0 };
  const { client } = makeRpcClient({ data: receipt, error: null });
  assert.deepEqual(await bankDeposit("user-1", 100, operationId, client), { status: "success", value: receipt });
});

test("更新前DBのP0001も、失敗のResultとして互換処理する", async () => {
  const dbError = new Error("所持金が不足しています");
  dbError.code = "P0001";
  const { client } = makeRpcClient({ data: null, error: dbError });

  const result = await bankDeposit("user-1", 100, operationId, client);

  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "OPERATION_REJECTED");
  assert.equal(result.error.detail.dbMessage, "所持金が不足しています");
});

test("銀行RPC固有のSQLSTATEを、サービスの失敗Resultへ反映する", async () => {
  const dbError = new Error("預金残高が不足しています");
  dbError.code = "MHB02";
  const { client } = makeRpcClient({ data: null, error: dbError });

  const result = await bankWithdraw("user-1", 100, operationId, client);

  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "INSUFFICIENT_DEPOSIT");
  assert.equal(result.error.detail.dbCode, "MHB02");
});

test("通信が失敗した書き込みは、結果不明として返す", async () => {
  // postgrest-js はサーバーへ届かなかった場合、code を空文字にする
  const networkError = new Error("TypeError: Failed to fetch");
  networkError.code = "";
  const { client } = makeRpcClient({ data: null, error: networkError });

  const result = await bankWithdraw("user-1", 30, operationId, client);

  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
});

test("再送にも指定したIDを使い、保存された結果をそのまま返す", async () => {
  const receipt = { operation_id: operationId, wallet_balance: 20, deposit_balance: 80, loan_balance: 0 };
  const { client, getCalled } = makeRpcClient({ data: receipt, error: null });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual(await bankDeposit("user-1", 80, operationId, client), { status: "success", value: receipt });
    assert.equal(getCalled().args.p_operation_id, operationId);
  }
});
test("RPCが例外を投げても結果不明のResultを返す", async () => {
  const client = { async rpc() { throw new Error("応答切断"); } };
  const result = await bankDeposit("user-1", 80, operationId, client);
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
});
test("同じ操作IDの入力不一致を専用コードで返す", async () => {
  const { client } = makeRpcClient({ data: null, error: { code: "MHB07", message: "不一致" } });
  const result = await bankDeposit("user-1", 80, operationId, client);
  assert.equal(result.error.code, "IDEMPOTENCY_CONFLICT");
});

test("成功応答の操作IDが確認できなければ、結果不明としてIDを保持させる", async () => {
  for (const data of [null, {}, { operation_id: "別の操作" }]) {
    const { client } = makeRpcClient({ data, error: null });
    const result = await bankWithdraw("user-1", 80, operationId, client);
    assert.equal(result.error.code, "OUTCOME_UNKNOWN");
  }
});

/**
 * bank_accounts を読み取る Supabase クライアントの代役を作る。
 * 期待するテーブル名・列・条件で呼ばれることも同時に検証する。
 */
function makeAccountClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "bank_accounts");
      return {
        select(columns) {
          assert.equal(columns, "*");
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

test("fetchBankAccountは取得に成功したら口座を返す", async () => {
  const account = { id: "bank-1", user_id: "user-1", deposit_balance: 100 };
  const client = makeAccountClient({ data: account, error: null });
  const result = await fetchBankAccount("user-1", client);
  assert.deepEqual(result, account);
});

test("fetchBankAccountは口座が存在しない場合nullを返す", async () => {
  const client = makeAccountClient({ data: null, error: null });
  const result = await fetchBankAccount("user-1", client);
  assert.equal(result, null);
});

test("fetchBankAccountは取得に失敗したらエラーを投げる", async () => {
  const client = makeAccountClient({ data: null, error: new Error("db error") });
  await assert.rejects(() => fetchBankAccount("user-1", client), /db error/);
});
