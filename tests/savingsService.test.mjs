import test from "node:test";
import assert from "node:assert/strict";
import { fetchSavingsSummary, setSavingsAmount, setSavingsDay, withdrawSavings } from "../lib/savingsService.ts";

test("積立RPCはユーザーIDを受け取らず、認証済み本人をDB側で特定する", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: { accounts: [] }, error: null }; } };
  await setSavingsAmount(0, client);
  await setSavingsDay(31, client);
  await withdrawSavings(500, " same-key ", client);
  assert.deepEqual(await fetchSavingsSummary(client), { accounts: [] });
  assert.deepEqual(calls, [
    ["set_savings_amount", { p_amount: 0 }], ["set_savings_day", { p_day: 31 }],
    ["withdraw_savings", { p_amount: 500, p_key: "same-key" }], ["get_savings_summary", {}],
  ]);
});
test("不正な金額と積立日は通信前に拒否する", async () => {
  const client = { rpc: () => { assert.fail("通信してはいけない"); } };
  for (const amount of [-1, .5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(setSavingsAmount(amount, client));
  for (const amount of [0, -1, .5]) await assert.rejects(withdrawSavings(amount, "key", client));
  for (const day of [0, 32, 1.5]) await assert.rejects(setSavingsDay(day, client));
  await assert.rejects(withdrawSavings(1, "", client));
});
test("DBの失敗を成功として扱わない", async () => {
  const error = { code: "P0001", message: "積立預金が不足しています" };
  const client = { rpc: async () => ({ data: null, error }) };
  await assert.rejects(withdrawSavings(1, "key", client), (actual) => actual === error);
  await assert.rejects(fetchSavingsSummary(client), (actual) => actual === error);
});
