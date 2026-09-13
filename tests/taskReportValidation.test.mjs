import assert from "node:assert/strict";
import test from "node:test";
import { validateTaskReport } from "../lib/taskReportValidation.ts";

const validDraft = {
  title: "食器洗い",
  description: "夕飯の後、自分から食器を洗った",
};

test("すべての項目が正しく入力されていればエラーなし", () => {
  assert.equal(validateTaskReport(validDraft), undefined);
});

test("タイトルが空・空白のみはエラーになる", () => {
  assert.match(validateTaskReport({ ...validDraft, title: "" }), /タイトルを入力してください/);
  assert.match(validateTaskReport({ ...validDraft, title: "   " }), /タイトルを入力してください/);
});

test("タイトルが30文字を超えるとエラーになる", () => {
  assert.match(
    validateTaskReport({ ...validDraft, title: "あ".repeat(31) }),
    /タイトルは30文字以内で入力してください/,
  );
  assert.equal(validateTaskReport({ ...validDraft, title: "あ".repeat(30) }), undefined);
});

test("説明が空・空白のみはエラーになる", () => {
  assert.match(validateTaskReport({ ...validDraft, description: "" }), /説明を入力してください/);
  assert.match(validateTaskReport({ ...validDraft, description: "   " }), /説明を入力してください/);
});

test("説明が200文字を超えるとエラーになる", () => {
  assert.match(
    validateTaskReport({ ...validDraft, description: "あ".repeat(201) }),
    /説明は200文字以内で入力してください/,
  );
  assert.equal(validateTaskReport({ ...validDraft, description: "あ".repeat(200) }), undefined);
});
