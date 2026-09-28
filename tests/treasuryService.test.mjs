import assert from "node:assert/strict";
import test from "node:test";
import {
  createFamilyWithTreasury,
  fetchEconomyTransactionPage,
  fetchEconomyTransactions,
  fetchGuildTreasury,
  issueTreasuryGol,
} from "../lib/treasuryService.ts";

function makeRpcClient(returnValue) {
  let called;
  return {
    client: {
      async rpc(name, args) {
        called = { name, args };
        return returnValue;
      },
    },
    getCalled: () => called,
  };
}

test("家族とギルド金庫を冪等キー付きで作成する", async () => {
  const { client, getCalled } = makeRpcClient({ data: "family-1", error: null });

  const familyId = await createFamilyWithTreasury("我が家", 10_000, "request-1", client);

  assert.equal(familyId, "family-1");
  assert.deepEqual(getCalled(), {
    name: "create_family_with_treasury",
    args: {
      p_family_name: "我が家",
      p_initial_supply: 10_000,
      p_idempotency_key: "request-1",
    },
  });
});

test("親によるゴル追加発行をRPCへ渡す", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: 11_000,
    initial_supply: 10_000,
    total_supply: 11_000,
    minimum_reserve_rate: 0.2,
  };
  const { client, getCalled } = makeRpcClient({ data: treasury, error: null });

  assert.equal(await issueTreasuryGol(1_000, "request-2", client), treasury);
  assert.deepEqual(getCalled(), {
    name: "issue_treasury_gol",
    args: { p_amount: 1_000, p_idempotency_key: "request-2" },
  });
});

test("RPCエラーを呼び出し元へ返す", async () => {
  const { client } = makeRpcClient({ data: null, error: new Error("forbidden") });
  await assert.rejects(
    () => issueTreasuryGol(1_000, "request-3", client),
    /forbidden/,
  );
});

test("安全な整数の範囲外の発行額はRPCへ送らない", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });

  await assert.rejects(
    () => issueTreasuryGol(Number.MAX_SAFE_INTEGER + 1, "request-4", client),
    /安全な整数/,
  );
  assert.equal(getCalled(), undefined);
});

test("DBから安全な整数の範囲外の金庫残高が返った場合は拒否する", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: Number.MAX_SAFE_INTEGER + 1,
    initial_supply: 10_000,
    total_supply: Number.MAX_SAFE_INTEGER + 1,
    minimum_reserve_rate: 0.2,
  };
  const { client } = makeRpcClient({ data: treasury, error: null });

  await assert.rejects(() => issueTreasuryGol(1, "request-5", client), /安全な整数/);
});

test("家族IDに対応するギルド金庫を取得する", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: 10_000,
    initial_supply: 10_000,
    total_supply: 10_000,
    minimum_reserve_rate: 0.2,
  };
  const client = {
    from(table) {
      assert.equal(table, "guild_treasuries");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, value) {
              assert.equal(column, "family_id");
              assert.equal(value, "family-1");
              return { async maybeSingle() { return { data: treasury, error: null }; } };
            },
          };
        },
      };
    },
  };

  assert.equal(await fetchGuildTreasury("family-1", client), treasury);
});

test("DBから範囲外の最低準備金率が返った場合は拒否する", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: 10_000,
    initial_supply: 10_000,
    total_supply: 10_000,
    minimum_reserve_rate: 1.1,
  };
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: treasury, error: null }; } };
            },
          };
        },
      };
    },
  };

  await assert.rejects(() => fetchGuildTreasury("family-1", client), /最低準備金率は0〜1/);
});

test("家族の経済台帳を新しい順で取得する", async () => {
  const transactions = [{ id: "tx-1", family_id: "family-1", amount: 100 }];
  const client = {
    from(table) {
      assert.equal(table, "economy_transactions");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, value) {
              assert.equal(column, "family_id");
              assert.equal(value, "family-1");
              return {
                async order(orderColumn, options) {
                  assert.equal(orderColumn, "created_at");
                  assert.deepEqual(options, { ascending: false });
                  return { data: transactions, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  assert.equal(await fetchEconomyTransactions("family-1", client), transactions);
});

test("経済台帳を上限付きで取得し、次ページの有無を返す", async () => {
  const transactions = [{ id: "tx-1" }, { id: "tx-2" }, { id: "tx-3" }];
  const calls = [];
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    order(column, options) { calls.push(["order", column, options]); return this; },
    or(value) { calls.push(["or", value]); return this; },
    async limit(value) {
      calls.push(["limit", value]);
      return { data: transactions, error: null };
    },
  };
  const client = { from(table) { assert.equal(table, "economy_transactions"); return query; } };
  const cursor = { created_at: "2026-09-10T00:00:00Z", id: "tx-cursor" };

  assert.deepEqual(await fetchEconomyTransactionPage("family-1", cursor, 2, client), {
    transactions: transactions.slice(0, 2),
    hasMore: true,
  });
  assert.deepEqual(calls.filter(([name]) => name === "order"), [
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
  ]);
  assert.deepEqual(calls.find(([name]) => name === "or"), [
    "or",
    "created_at.lt.2026-09-10T00:00:00Z,and(created_at.eq.2026-09-10T00:00:00Z,id.lt.tx-cursor)",
  ]);
  assert.deepEqual(calls.at(-1), ["limit", 3]);
});
