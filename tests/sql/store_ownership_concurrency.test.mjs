// CIの一時DB専用。別接続の未コミット中に購入・配置を競合させる。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

const pgUrl = process.env.PGURL;
if (!pgUrl) throw new Error("PGURLを指定してください");
const family = "22600000-0000-4000-8000-000000000001";
const user = "22600000-0000-4000-8000-000000000012";
const item = (number) => `22600000-0000-4000-8000-0000000000${number}`;
const processes = new Set();
function psql(query, application = "ownership-test") {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [pgUrl, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-Atq", "-c", query], {
      env: { ...process.env, PGAPPNAME: application, PGOPTIONS: `-c request.jwt.claim.sub=${user}` },
    });
    processes.add(child);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      processes.delete(child);
      resolve({ code, stdout: stdout.trim(), stderr });
    });
  });
}
async function sql(query) {
  const result = await psql(query);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}
before(async () => {
  await sql(`reset request.jwt.claim.sub;
    insert into public.families(id, name) values ('${family}', '所有の並行検証');
    insert into public.users(id, family_id, name, role, balance) values ('${user}', '${family}', '子', 'child', 1000);
    insert into public.guild_treasuries(family_id, balance, initial_supply, total_supply, minimum_reserve_rate)
      values ('${family}', 1000, 2000, 2000, 0.2);
    insert into public.economy_monthly_snapshots(family_id, snapshot_month, avg_circulating_gol, target_gol, price_index, calculation_basis)
      values ('${family}', private.family_calendar_month(now()), 1000, 1000, 100, '{}');
    insert into public.store_items(id, family_id, requested_by, title, price, stock, asset_id) values
      ('${item(31)}', '${family}', '${user}', '帽子A', 100, 10, 'wearable-hat'),
      ('${item(32)}', '${family}', '${user}', '帽子B', 100, 10, 'wearable-hat'),
      ('${item(33)}', '${family}', '${user}', '木', 100, 10, 'decoration-tree');`);
});
after(async () => {
  for (const child of processes) child.kill();
  await sql(`reset request.jwt.claim.sub;
    delete from public.transactions where user_id = '${user}';
    delete from public.economy_transactions where family_id = '${family}';
    delete from public.economy_monthly_snapshots where family_id = '${family}';
    delete from public.economy_settings where family_id = '${family}';
    delete from public.store_items where family_id = '${family}';
    delete from public.guild_treasuries where family_id = '${family}';
    delete from public.users where id = '${user}';
    delete from public.families where id = '${family}';`);
});
async function compete(firstCall, secondCall) {
  const first = psql(`begin; set local role authenticated; ${firstCall} select pg_sleep(2); commit;`, "ownership-first");
  let waiting = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await sql("select exists(select 1 from pg_stat_activity where application_name = 'ownership-first' and wait_event = 'PgSleep')") === "t") {
      waiting = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(waiting, true, "先行処理が未コミットの状態を確認できる");
  return Promise.all([first, psql(`begin; set local role authenticated; ${secondCall} commit;`, "ownership-second")]);
}
const buy = (number, key) => `select public.purchase_store_item('${user}', '${item(number)}', '${key}', 100);`;

test("同じ着せ替えを別商品から並行購入しても一方だけ決済・所有される", { timeout: 15000 }, async () => {
  const results = await compete(buy(31, "225-race-hat-a"), buy(32, "225-race-hat-b"));
  assert.equal(results[0].code, 0, results[0].stderr);
  assert.notEqual(results[1].code, 0);
  assert.match(results[1].stderr, /P0225/);
  assert.equal(await sql(`select quantity from public.owned_items where user_id = '${user}' and asset_id = 'wearable-hat'`), "1");
  assert.equal(await sql(`select balance from public.users where id = '${user}'`), "900");
  assert.equal(await sql(`select balance from public.guild_treasuries where family_id = '${family}'`), "1100");
  assert.equal(await sql(`select sum(stock) from public.store_items where id in ('${item(31)}', '${item(32)}')`), "19");
  assert.equal(await sql(`select count(*) from public.economy_transactions where family_id = '${family}'`), "1");
  assert.equal(await sql(`select count(*) from public.transactions where user_id = '${user}' and type = 'store_purchase'`), "1");
});

test("装飾購入の同じ操作を並行再送しても所有は1個だけ増える", { timeout: 15000 }, async () => {
  const call = buy(33, "225-race-tree");
  const results = await compete(call, call);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(results[0].stdout.split("\n")[0], results[1].stdout);
  assert.equal(await sql(`select quantity from public.owned_items where user_id = '${user}' and asset_id = 'decoration-tree'`), "1");
  assert.equal(await sql(`select balance from public.users where id = '${user}'`), "800");
  assert.equal(await sql(`select stock from public.store_items where id = '${item(33)}'`), "9");
});

test("所有1個の装飾を並行配置しても1個しか置けない", { timeout: 15000 }, async () => {
  const place = `insert into public.placed_decorations(user_id, asset_id, position_x, position_z)
    values ('${user}', 'decoration-tree', 0, 0);`;
  const results = await compete(place, place);
  assert.equal(results[0].code, 0, results[0].stderr);
  assert.notEqual(results[1].code, 0);
  assert.match(results[1].stderr, /すべて配置済み/);
  assert.equal(await sql(`select count(*) from public.placed_decorations where user_id = '${user}'`), "1");
});
