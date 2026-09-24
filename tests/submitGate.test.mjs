import assert from "node:assert/strict";
import test from "node:test";
import { PREVIEW_DISABLED_NOTICE } from "../constants/ui.ts";
import { getSubmitBlockReason, getSubmitNotice } from "../lib/submitGate.ts";

test("実データに書き込めて、ロールが合えば送信できる", () => {
  assert.equal(getSubmitBlockReason(true, "child", "child"), null);
  assert.equal(getSubmitBlockReason(true, "parent", "parent"), null);
});

test("実データに書き込めなければ、ロールに関わらずプレビュー中として止める", () => {
  assert.equal(getSubmitBlockReason(false, "child", "child"), "preview");
  // 両方に当たるときもプレビュー中を優先する（ロールを変えても送れないため）
  assert.equal(getSubmitBlockReason(false, "parent", "child"), "preview");
  assert.equal(getSubmitBlockReason(false, null, "child"), "preview");
});

test("ロールが違えば止める。未ログインも同じ扱い", () => {
  assert.equal(getSubmitBlockReason(true, "parent", "child"), "wrong_role");
  assert.equal(getSubmitBlockReason(true, "child", "parent"), "wrong_role");
  assert.equal(getSubmitBlockReason(true, null, "child"), "wrong_role");
});

test("注記はエラーを最優先で出す", () => {
  assert.deepEqual(getSubmitNotice("通信に失敗しました", "preview", "お手伝いの報告", "child"), {
    isError: true,
    text: "通信に失敗しました",
  });
});

test("送信できない理由ごとの注記", () => {
  assert.deepEqual(getSubmitNotice(null, "preview", "お手伝いの報告", "child"), {
    isError: false,
    text: PREVIEW_DISABLED_NOTICE,
  });
  // 統合前の2画面の文言と同じになること
  assert.deepEqual(getSubmitNotice(null, "wrong_role", "お手伝いの報告", "child"), {
    isError: false,
    text: "※ お手伝いの報告は子供用アカウントのみ利用できます",
  });
  assert.deepEqual(getSubmitNotice(null, "wrong_role", "商品追加の申請", "child"), {
    isError: false,
    text: "※ 商品追加の申請は子供用アカウントのみ利用できます",
  });
  assert.equal(getSubmitNotice(null, "wrong_role", "承認", "parent").text, "※ 承認は大人用アカウントのみ利用できます");
});

test("送信できて、エラーも無ければ注記は出さない", () => {
  assert.equal(getSubmitNotice(null, null, "お手伝いの報告", "child"), null);
  assert.equal(getSubmitNotice("", null, "お手伝いの報告", "child"), null);
});
