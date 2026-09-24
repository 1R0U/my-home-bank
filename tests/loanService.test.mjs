import assert from "node:assert/strict";
import test from "node:test";
import {
  approveLoan,
  fetchLoanOffer,
  rejectLoan,
  repayLoan,
  requestLoan,
  updateLoanSettings,
} from "../lib/loanService.ts";

function rpcClient(data = "result") {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data, error: null };
      },
    },
  };
}

test("ローン申請は元本・用途・冪等キーをRPCへ渡す", async () => {
  const mock = rpcClient("loan-1");
  const result = await requestLoan("child-1", 100, "  本を買う  ", " request-1 ", mock.client);
  assert.equal(result, "loan-1");
  assert.deepEqual(mock.calls, [{
    name: "request_loan",
    args: {
      p_borrower_id: "child-1",
      p_amount: 100,
      p_purpose: "本を買う",
      p_idempotency_key: "request-1",
    },
  }]);
});

test("承認・却下は申請IDと親IDをRPCへ渡す", async () => {
  const mock = rpcClient("loan-1");
  await approveLoan("loan-1", "parent-1", mock.client);
  await rejectLoan("loan-2", "parent-1", mock.client);
  assert.deepEqual(mock.calls, [
    { name: "approve_loan", args: { p_loan_id: "loan-1", p_approver_id: "parent-1" } },
    { name: "reject_loan", args: { p_loan_id: "loan-2", p_approver_id: "parent-1" } },
  ]);
});

test("返済は契約ID・本人・金額・冪等キーをRPCへ渡す", async () => {
  const mock = rpcClient("repayment-1");
  await repayLoan("loan-1", "child-1", 30, " repay-1 ", mock.client);
  assert.deepEqual(mock.calls[0], {
    name: "repay_loan",
    args: {
      p_loan_id: "loan-1",
      p_borrower_id: "child-1",
      p_amount: 30,
      p_idempotency_key: "repay-1",
    },
  });
});

test("親の個別設定をRPCへ渡す", async () => {
  const mock = rpcClient(null);
  await updateLoanSettings("child-1", 500, 0.05, 30, mock.client);
  assert.deepEqual(mock.calls[0], {
    name: "update_loan_settings",
    args: {
      p_borrower_id: "child-1",
      p_loan_limit: 500,
      p_monthly_interest_rate: 0.05,
      p_term_days: 30,
    },
  });
});

test("貸出条件RPCの1行目を返す", async () => {
  const offer = { loan_limit: 500, monthly_interest_rate: 0.05, term_days: 30 };
  const mock = rpcClient([offer]);
  assert.deepEqual(await fetchLoanOffer("child-1", mock.client), offer);
  assert.deepEqual(mock.calls[0], {
    name: "get_loan_offer",
    args: { p_borrower_id: "child-1" },
  });
});

test("RPCエラーを呼び出し元へ返す", async () => {
  const error = new Error("失敗");
  const client = { rpc: async () => ({ data: null, error }) };
  await assert.rejects(() => requestLoan("child-1", 100, "本", "key", client), error);
});
