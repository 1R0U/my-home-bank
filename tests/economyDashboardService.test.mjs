import assert from "node:assert/strict";
import test from "node:test";
import { fetchEconomyPriceOverview, fetchPendingRewardTotal } from "../lib/economyDashboardService.ts";

test("親用物価概要RPCの結果を返す", async () => {
  const overview = {
    current: { snapshot_month: "2026-09-01", avg_circulating_gol: 500, target_gol: 1000, price_index: 100, calculation_basis: {} },
    previous: null,
    next_update_date: "2026-10-01",
  };
  const client = {
    async rpc(name) {
      assert.equal(name, "get_economy_price_overview");
      return { data: overview, error: null };
    },
  };
  assert.equal(await fetchEconomyPriceOverview(client), overview);
});

test("壊れた物価概要を画面へ渡さない", async () => {
  const client = { async rpc() { return { data: {}, error: null }; } };
  await assert.rejects(() => fetchEconomyPriceOverview(client), /物価情報/);
});

test("承認待ちクエストの報酬見込を合計する", async () => {
  const calls = [];
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    then(resolve) { return Promise.resolve({ data: [{ reward_amount: 30 }, { reward_amount: 70 }], error: null }).then(resolve); },
  };
  const client = { from(table) { assert.equal(table, "quests"); return query; } };
  assert.equal(await fetchPendingRewardTotal("family-1", client), 100);
  assert.deepEqual(calls, [["select", "reward_amount"], ["eq", "family_id", "family-1"], ["eq", "status", "pending"]]);
});
