import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySupabaseError,
  describeAppError,
  fail,
  isSafeToRetry,
  ok,
} from "../lib/errors.ts";

/** Supabase が返すエラーの形（PostgrestError は Error を継承し、code に SQLSTATE が入る） */
function postgrestError(code, message) {
  const error = new Error(message);
  error.name = "PostgrestError";
  error.code = code;
  error.details = "";
  error.hint = "";
  return error;
}

// --- SQLSTATE からの分類 ---

test("raise exception（P0001）は業務ルールによる拒否として分類する", () => {
  const error = classifySupabaseError(
    postgrestError("P0001", "所持金が不足しています（所持金: 100, 預入額: 200）"),
    "write",
  );

  assert.equal(error.code, "OPERATION_REJECTED");
  assert.equal(error.detail.dbCode, "P0001");
  assert.match(error.detail.dbMessage, /所持金が不足/);
});

test("制約違反のSQLSTATEは CONSTRAINT_VIOLATION として分類する", () => {
  for (const code of ["23502", "23503", "23505", "23514", "23P01"]) {
    assert.equal(
      classifySupabaseError(postgrestError(code, "violates constraint"), "write").code,
      "CONSTRAINT_VIOLATION",
      `${code} が CONSTRAINT_VIOLATION にならない`,
    );
  }
});

test("通信の失敗は、書き込みでは結果不明、読み取りでは通信エラーとして分類する", () => {
  // postgrest-js は、サーバーへ届かなかった場合に code を空文字のままにする
  const networkError = postgrestError("", "TypeError: Failed to fetch");

  assert.equal(
    classifySupabaseError(networkError, "write").code,
    "OUTCOME_UNKNOWN",
    "書き込みはDB側が成功している可能性を否定できない",
  );
  assert.equal(
    classifySupabaseError(networkError, "read").code,
    "NETWORK_ERROR",
    "読み取りは何も変えていないため、そのまま再試行してよい",
  );
});

test("未知のSQLSTATEを、既知の失敗へ勝手に分類しない", () => {
  const error = classifySupabaseError(postgrestError("42501", "permission denied"), "write");

  assert.equal(error.code, "UNEXPECTED");
  // 調査できるよう、元のコードとメッセージは残す
  assert.equal(error.detail.dbCode, "42501");
  assert.equal(error.detail.dbMessage, "permission denied");
});

test("PostgREST層のエラーも、分類できないものは UNEXPECTED にする", () => {
  assert.equal(
    classifySupabaseError(postgrestError("PGRST301", "JWT expired"), "write").code,
    "UNEXPECTED",
  );
});

test("Supabaseのエラーの形をしていない値も UNEXPECTED として扱う", () => {
  for (const value of [new Error("そのままのError"), "文字列", null, undefined, 42]) {
    const error = classifySupabaseError(value, "write");
    assert.equal(error.code, "UNEXPECTED", `${String(value)} が UNEXPECTED にならない`);
  }
});

test("メッセージの内容では分類しない（文言を変えても分類が変わらない）", () => {
  // 「所持金が不足」という文言でも、SQLSTATEが制約違反ならそちらに従う
  const error = classifySupabaseError(
    postgrestError("23514", "所持金が不足しています"),
    "write",
  );

  assert.equal(error.code, "CONSTRAINT_VIOLATION");
});

// --- 表示文言 ---

test("業務ルールによる拒否では、DBが返した文言をそのまま表示する", () => {
  const message = describeAppError({
    code: "OPERATION_REJECTED",
    detail: { dbCode: "P0001", dbMessage: "預金残高が不足しています" },
  });

  assert.equal(message, "預金残高が不足しています");
});

test("業務ルールによる拒否でも、文言が空なら既定の文を出す", () => {
  const message = describeAppError({
    code: "OPERATION_REJECTED",
    detail: { dbCode: "P0001", dbMessage: "" },
  });

  assert.equal(message, "この操作は受け付けられませんでした。");
});

test("すべてのERROR CODEに表示文言がある（分岐の追加漏れを検出する）", () => {
  const allCodes = [
    "INVALID_AMOUNT",
    "OPERATION_REJECTED",
    "CONSTRAINT_VIOLATION",
    "NETWORK_ERROR",
    "OUTCOME_UNKNOWN",
    "UNEXPECTED",
  ];

  for (const code of allCodes) {
    const message = describeAppError({ code });
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0, `${code} の表示文言が空`);
  }
});

test("結果不明の文言は、反映されたかの確認を促す", () => {
  assert.match(describeAppError({ code: "OUTCOME_UNKNOWN" }), /確認/);
});

test("未対応のERROR CODEを渡すと例外になる", () => {
  assert.throws(() => describeAppError({ code: "NOT_DEFINED_YET" }), /未対応のERROR CODE/);
});

// --- 再試行の可否 ---

test("結果不明は、そのまま再試行してよい失敗に含めない", () => {
  assert.equal(isSafeToRetry({ code: "OUTCOME_UNKNOWN" }), false, "二重反映しうる");
  assert.equal(isSafeToRetry({ code: "OPERATION_REJECTED" }), false, "入力を直す必要がある");
  assert.equal(isSafeToRetry({ code: "CONSTRAINT_VIOLATION" }), false);
  assert.equal(isSafeToRetry({ code: "UNEXPECTED" }), false);
  assert.equal(isSafeToRetry({ code: "NETWORK_ERROR" }), true, "読み取りは安全にやり直せる");
});

// --- Result型 ---

test("ok と fail で成功・失敗を作り分けられる", () => {
  assert.deepEqual(ok(null), { status: "success", value: null });
  assert.deepEqual(ok(42), { status: "success", value: 42 });
  assert.deepEqual(fail({ code: "UNEXPECTED" }), {
    status: "failure",
    error: { code: "UNEXPECTED" },
  });
});
