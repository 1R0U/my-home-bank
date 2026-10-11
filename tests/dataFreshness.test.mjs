import assert from "node:assert/strict";
import test from "node:test";
import {
  createChangeTrackingFetch,
  getDataVersion,
  isWriteRequest,
  markDataChanged,
} from "../lib/dataFreshness.ts";

// フォーカス時の再取得を省いてよいかは、この端末から書き込みがあったかで決まる（Issue #243）。
// 書き込みを見逃すと「承認したのに反映されない」に戻るので、判定を細かく確かめる。

const BASE = "https://example.supabase.co";

test("読み取り（GET / HEAD）は書き込みとして数えない", () => {
  assert.equal(isWriteRequest("GET", `${BASE}/rest/v1/quests?select=*`), false);
  assert.equal(isWriteRequest(undefined, `${BASE}/rest/v1/quests?select=*`), false);
  assert.equal(isWriteRequest("head", `${BASE}/rest/v1/quests`), false);
});

test("テーブルへの追加・更新・削除は書き込みとして数える", () => {
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/quests`), true);
  assert.equal(isWriteRequest("PATCH", `${BASE}/rest/v1/users?id=eq.1`), true);
  assert.equal(isWriteRequest("DELETE", `${BASE}/rest/v1/placed_decorations?id=eq.1`), true);
  assert.equal(isWriteRequest("post", `${BASE}/rest/v1/quests`), true);
});

test("更新系の RPC は書き込み、読み取りだけの RPC（get_ / current_）は数えない", () => {
  for (const name of ["approve_quest_log", "purchase_store_item", "issue_treasury_gol", "bank_deposit", "set_savings_amount"]) {
    assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/${name}`), true, name);
  }
  for (const name of ["get_loan_offer", "get_current_store_catalog", "get_savings_summary", "current_user_family_id"]) {
    assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/${name}`), false, name);
  }
});

test("ほかの画面の表示に関係しない書き込み（アプリを開いた日の記録）は数えない", () => {
  // 親が前面に戻るたびに呼ぶので、数えるとどの画面でもフォーカス時の取得を省けなくなる（Issue #355 / #243）
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/record_app_open`), false);
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/record_app_open?select=*`), false);
  // 名前の一部が同じだけの RPC は、ふつうの書き込みとして数える
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/record_app_open_v2`), true);
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/rpc/record_quest_streak_celebration`), true);
  // テーブルへの直接の書き込みは数える
  assert.equal(isWriteRequest("POST", `${BASE}/rest/v1/app_open_days`), true);
});

test("判断に迷う要求（ストレージ・認証）は書き込みに倒す", () => {
  assert.equal(isWriteRequest("POST", `${BASE}/storage/v1/object/store-item-images/a.jpg`), true);
  assert.equal(isWriteRequest("POST", `${BASE}/auth/v1/token?grant_type=refresh_token`), true);
});

test("書き込みの要求が終わると番号が増え、読み取りでは増えない", async () => {
  const calls = [];
  const trackingFetch = createChangeTrackingFetch(async (input, init) => {
    calls.push([input, init?.method]);
    return new Response("{}", { status: 200 });
  });

  const before = getDataVersion();
  await trackingFetch(`${BASE}/rest/v1/quests?select=*`);
  await trackingFetch(`${BASE}/rest/v1/rpc/get_loan_offer`, { method: "POST" });
  assert.equal(getDataVersion(), before);

  await trackingFetch(`${BASE}/rest/v1/rpc/approve_quest_log`, { method: "POST" });
  assert.equal(getDataVersion(), before + 2, "送る前と終わった後の2回");
  assert.equal(calls.length, 3, "要求そのものは素通しする");
});

test("書き込みが失敗・例外でも番号を増やす（結果が分からない書き込みも反映されているかもしれない）", async () => {
  const failing = createChangeTrackingFetch(async () => new Response("{}", { status: 500 }));
  const throwing = createChangeTrackingFetch(async () => {
    throw new TypeError("Network request failed");
  });

  const before = getDataVersion();
  const response = await failing(`${BASE}/rest/v1/rpc/purchase_store_item`, { method: "POST" });
  assert.equal(response.status, 500);
  await assert.rejects(throwing(`${BASE}/rest/v1/rpc/bank_deposit`, { method: "POST" }), TypeError);
  assert.equal(getDataVersion(), before + 4);
});

test("Request オブジェクトで渡された要求も、メソッドと URL を見て判定する", async () => {
  const trackingFetch = createChangeTrackingFetch(async () => new Response("{}"));
  const before = getDataVersion();
  await trackingFetch(new Request(`${BASE}/rest/v1/quests`, { method: "POST", body: "{}" }));
  assert.equal(getDataVersion(), before + 2);
});

test("書き込みの応答を待つ間にも番号が進んでいる（応答前に別のタブへ移ったときに取り直すため）", async () => {
  let respond;
  const trackingFetch = createChangeTrackingFetch(
    () => new Promise((resolve) => {
      respond = () => resolve(new Response("{}"));
    }),
  );

  const before = getDataVersion();
  const pending = trackingFetch(`${BASE}/rest/v1/rpc/approve_quest_log`, { method: "POST" });
  assert.equal(getDataVersion(), before + 1, "応答前に1回進む");

  // 応答前に移った先のタブがここで取り直す。その時点の番号を控えておく
  const seenWhileWaiting = getDataVersion();
  respond();
  await pending;
  assert.equal(getDataVersion(), seenWhileWaiting + 1, "応答後にもう1回進むので、次のフォーカスでも取り直す");
});

test("markDataChanged は番号を1つ進める", () => {
  const before = getDataVersion();
  markDataChanged();
  assert.equal(getDataVersion(), before + 1);
});
