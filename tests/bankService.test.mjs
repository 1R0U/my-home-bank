import assert from "node:assert/strict";
import test from "node:test";
import { bankDeposit, bankWithdraw, fetchBankAccount } from "../lib/bankService.ts";

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
  await bankDeposit("user-1", 100, client);
  assert.deepEqual(getCalled(), { fn: "bank_deposit", args: { p_user_id: "user-1", p_amount: 100 } });
});

test("bankWithdrawは正しい関数名・引数でRPCを呼び出す", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });
  await bankWithdraw("user-1", 50, client);
  assert.deepEqual(getCalled(), { fn: "bank_withdraw", args: { p_user_id: "user-1", p_amount: 50 } });
});

test("各操作は成功したら ok の Result を返す", async () => {
  const { client } = makeRpcClient({ data: null, error: null });
  assert.deepEqual(await bankDeposit("user-1", 100, client), { status: "success", value: null });
});

test("各操作は失敗しても例外を投げず、失敗の Result を返す", async () => {
  const dbError = new Error("所持金が不足しています");
  dbError.code = "P0001";
  const { client } = makeRpcClient({ data: null, error: dbError });

  const result = await bankDeposit("user-1", 100, client);

  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "OPERATION_REJECTED");
  assert.equal(result.error.detail.dbMessage, "所持金が不足しています");
});

test("通信が失敗した書き込みは、結果不明として返す", async () => {
  // postgrest-js はサーバーへ届かなかった場合、code を空文字にする
  const networkError = new Error("TypeError: Failed to fetch");
  networkError.code = "";
  const { client } = makeRpcClient({ data: null, error: networkError });

  const result = await bankWithdraw("user-1", 30, client);

  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "OUTCOME_UNKNOWN");
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
