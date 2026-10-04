// 実際の別接続で、先行操作の未コミット中に再送・残高競合を起こす。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const pgUrl = process.env.PGURL;
if (!pgUrl) throw new Error("PGURLを指定してください");
const familyId = "19000000-0000-4000-8000-000000000100";
const userId = "19000000-0000-4000-8000-000000000101";
const processes = new Set();
function psql(query, applicationName = "bank-test") {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [pgUrl, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-Atq", "-c", query], {
      env: { ...process.env, PGAPPNAME: applicationName, PGOPTIONS: `-c request.jwt.claim.sub=${userId}` },
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
  // fixtureのユーザー作成は、本人設定のない所有者接続で実施する。
  await sql(`reset request.jwt.claim.sub;
    insert into public.families(id, name) values('${familyId}', '銀行並行検証');
    insert into public.users(id, family_id, name, role, balance) values('${userId}', '${familyId}', '子', 'child', 100);`);
});
after(async () => {
  for (const child of processes) child.kill();
  await sql(`reset request.jwt.claim.sub;
    delete from public.transactions where user_id = '${userId}';
    delete from public.users where id = '${userId}';
    delete from public.families where id = '${familyId}';`);
});
async function resetBalances() {
  await sql(`delete from public.bank_operations where user_id = '${userId}';
    delete from public.transactions where user_id = '${userId}';
    update public.users set balance = 100 where id = '${userId}';
    update public.bank_accounts set deposit_balance = 100, loan_balance = 100 where user_id = '${userId}';`);
}
async function waitForFirst() {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await sql("select exists(select 1 from pg_stat_activity where application_name = 'bank-first' and wait_event = 'PgSleep')") === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("先行操作の未コミット状態を確認できませんでした");
}
for (const kind of ["deposit", "withdraw", "borrow", "repay"]) {
  test(`${kind}: 同じIDの並行再送は1回分だけ反映する`, { timeout: 15000 }, async () => {
    await resetBalances();
    const id = randomUUID();
    const call = `select public.bank_${kind}('${userId}', 80, '${id}');`;
    // 旧borrow/repayの経路を公開しないまま、所有者接続で処理の冪等性を検証する。
    const role = ["deposit", "withdraw"].includes(kind) ? "set local role authenticated;" : "";
    const first = psql(`begin; ${role} ${call} select pg_sleep(2); commit;`, "bank-first");
    await waitForFirst();
    const second = psql(`begin; ${role} ${call} commit;`, "bank-second");
    const results = await Promise.all([first, second]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    assert.equal(results[0].stdout.split("\n").find((line) => line.startsWith("{")), results[1].stdout);
    assert.equal(await sql(`select count(*) from public.transactions where user_id = '${userId}'`), "1");
    assert.equal(await sql(`select count(*) from public.bank_operations where user_id = '${userId}'`), "1");
    const wallet = ["deposit", "repay"].includes(kind) ? 20 : 180;
    assert.equal(await sql(`select balance from public.users where id = '${userId}'`), String(wallet));
  });
}
for (const kind of ["deposit", "withdraw", "repay"]) {
  test(`${kind}: 残高100へ別IDで80ずつ並行送信すると一方だけ成功する`, { timeout: 15000 }, async () => {
    await resetBalances();
    const firstId = randomUUID(), secondId = randomUUID();
    const first = psql(`begin; select public.bank_${kind}('${userId}', 80, '${firstId}'); select pg_sleep(2); commit;`, "bank-first");
    await waitForFirst();
    const second = psql(`select public.bank_${kind}('${userId}', 80, '${secondId}');`, "bank-second");
    const results = await Promise.all([first, second]);
    assert.equal(results[0].code, 0, results[0].stderr);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].stderr, kind === "withdraw" ? /MHB02/ : /MHB01/);
    assert.equal(await sql(`select count(*) from public.transactions where user_id = '${userId}'`), "1");
    assert.equal(await sql(`select count(*) from public.bank_operations where user_id = '${userId}'`), "1");
  });
}
