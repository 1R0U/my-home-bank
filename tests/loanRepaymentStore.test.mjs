import assert from "node:assert/strict";
import test from "node:test";
import { useLoanRepaymentStore } from "../store/loanRepaymentStore.ts";

const first = { loanId: "loan-1", amount: 30, key: "repay-1" };
const second = { loanId: "loan-2", amount: 20, key: "repay-2" };

test.beforeEach(() => useLoanRepaymentStore.setState({ pendingByUser: {}, sendingByUser: {} }));

test("送信中は結果未確認にせず、同じ利用者の別画面からの二重送信も止める", () => {
  const store = useLoanRepaymentStore.getState();
  assert.equal(store.start("child-1", first), true);
  assert.equal(useLoanRepaymentStore.getState().pendingByUser["child-1"], undefined);
  assert.equal(store.start("child-1", first), false);
  assert.equal(store.start("child-1", second), false);
  assert.equal(store.start("child-2", second), true);
});

test("結果未確認の返済は同じ本人・契約・金額・キーだけ再送できる", () => {
  const store = useLoanRepaymentStore.getState();
  store.start("child-1", first);
  store.retainUnknown("child-1", first);
  store.finishSending("child-1", first);
  assert.deepEqual(useLoanRepaymentStore.getState().pendingByUser["child-1"], first);
  for (const changed of [second, { ...first, loanId: "loan-other" }, { ...first, amount: 31 }]) {
    assert.equal(store.start("child-1", changed), false);
  }
  assert.equal(store.start("child-1", first), true);
  store.resolve("child-1", first);
  store.finishSending("child-1", first);
  assert.equal(useLoanRepaymentStore.getState().pendingByUser["child-1"], undefined);
  assert.equal(store.start("child-1", second), true);
});

test("古い画面の完了処理で別の返済や別利用者の記録を消さない", () => {
  const store = useLoanRepaymentStore.getState();
  store.start("child-1", second);
  store.retainUnknown("child-1", second);
  store.start("child-2", first);
  store.retainUnknown("child-2", first);
  store.resolve("child-1", first);
  store.finishSending("child-1", first);
  store.retainUnknown("child-1", first);
  assert.deepEqual(useLoanRepaymentStore.getState().pendingByUser["child-1"], second);
  assert.deepEqual(useLoanRepaymentStore.getState().sendingByUser["child-1"], second);
  assert.deepEqual(useLoanRepaymentStore.getState().pendingByUser["child-2"], first);
});
