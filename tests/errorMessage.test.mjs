import assert from "node:assert/strict";
import test from "node:test";
import { toErrorMessage } from "../lib/errorMessage.ts";

test("ErrorとSupabaseの通常オブジェクトから理由を取り出す", () => {
  assert.equal(toErrorMessage(new Error("通信できません"), "失敗"), "通信できません");
  assert.equal(toErrorMessage({ message: "権限がありません" }, "失敗"), "権限がありません");
});

test("理由がない場合は既定のメッセージを返す", () => {
  assert.equal(toErrorMessage({ message: " " }, "タスクの追加に失敗しました"), "タスクの追加に失敗しました");
  assert.equal(toErrorMessage(null, "タスクの追加に失敗しました"), "タスクの追加に失敗しました");
});
