import assert from "node:assert/strict";
import test from "node:test";
import {
  createFamilyWithTreasury,
  fetchEconomyTransactions,
  fetchGuildTreasury,
  issueTreasuryHmc,
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

test("親によるHMC追加発行をRPCへ渡す", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: 11_000,
    initial_supply: 10_000,
    total_supply: 11_000,
  };
  const { client, getCalled } = makeRpcClient({ data: treasury, error: null });

  assert.equal(await issueTreasuryHmc(1_000, "request-2", client), treasury);
  assert.deepEqual(getCalled(), {
    name: "issue_treasury_hmc",
    args: { p_amount: 1_000, p_idempotency_key: "request-2" },
  });
});

test("RPCエラーを呼び出し元へ返す", async () => {
  const { client } = makeRpcClient({ data: null, error: new Error("forbidden") });
  await assert.rejects(
    () => issueTreasuryHmc(1_000, "request-3", client),
    /forbidden/,
  );
});

test("安全な整数の範囲外の発行額はRPCへ送らない", async () => {
  const { client, getCalled } = makeRpcClient({ data: null, error: null });

  await assert.rejects(
    () => issueTreasuryHmc(Number.MAX_SAFE_INTEGER + 1, "request-4", client),
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
  };
  const { client } = makeRpcClient({ data: treasury, error: null });

  await assert.rejects(() => issueTreasuryHmc(1, "request-5", client), /安全な整数/);
});

test("家族IDに対応するギルド金庫を取得する", async () => {
  const treasury = {
    id: "treasury-1",
    family_id: "family-1",
    balance: 10_000,
    initial_supply: 10_000,
    total_supply: 10_000,
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
