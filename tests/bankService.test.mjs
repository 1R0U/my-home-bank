import assert from "node:assert/strict";
import test from "node:test";
import { bankBorrow, bankDeposit, bankRepay, bankWithdraw, fetchBankAccount } from "../lib/bankService.ts";

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

test("bankBorrowは正しい関数名・引数でRPCを呼び出す", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });
  await bankBorrow("user-1", 200, client);
  assert.deepEqual(getCalled(), { fn: "bank_borrow", args: { p_user_id: "user-1", p_amount: 200 } });
});

test("bankRepayは正しい関数名・引数でRPCを呼び出す", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });
  await bankRepay("user-1", 30, client);
  assert.deepEqual(getCalled(), { fn: "bank_repay", args: { p_user_id: "user-1", p_amount: 30 } });
});

test("各操作はRPCのエラーをそのまま投げる", async () => {
  const { client } = makeRpcClient({ data: null, error: new Error("insufficient balance") });
  await assert.rejects(() => bankDeposit("user-1", 100, client), /insufficient balance/);
});

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
