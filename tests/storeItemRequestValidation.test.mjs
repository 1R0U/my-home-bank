import assert from "node:assert/strict";
import test from "node:test";
import { validateStoreItemRequest } from "../lib/storeItemRequestValidation.ts";

const validDraft = {
  imageUri: "file:///tmp/photo.jpg",
  title: "夕飯リクエスト権2",
  description: "夕飯を2回リクエストできる",
  reason: "お手伝いを頑張ったから",
};

test("すべての項目が正しく入力されていればエラーなし", () => {
  assert.equal(validateStoreItemRequest(validDraft), undefined);
});

test("画像未選択はエラーになる", () => {
  assert.match(
    validateStoreItemRequest({ ...validDraft, imageUri: null }),
    /商品画像を選択してください/,
  );
});

test("商品名が空・空白のみはエラーになる", () => {
  assert.match(validateStoreItemRequest({ ...validDraft, title: "" }), /商品名を入力してください/);
  assert.match(validateStoreItemRequest({ ...validDraft, title: "   " }), /商品名を入力してください/);
});

test("商品名が30文字を超えるとエラーになる", () => {
  assert.match(
    validateStoreItemRequest({ ...validDraft, title: "あ".repeat(31) }),
    /商品名は30文字以内で入力してください/,
  );
  assert.equal(validateStoreItemRequest({ ...validDraft, title: "あ".repeat(30) }), undefined);
});

test("商品の詳細が空はエラーになる", () => {
  assert.match(
    validateStoreItemRequest({ ...validDraft, description: "" }),
    /商品の詳細を入力してください/,
  );
});

test("商品の詳細が200文字を超えるとエラーになる", () => {
  assert.match(
    validateStoreItemRequest({ ...validDraft, description: "あ".repeat(201) }),
    /商品の詳細は200文字以内で入力してください/,
  );
});

test("欲しい理由が空はエラーになる", () => {
  assert.match(validateStoreItemRequest({ ...validDraft, reason: "" }), /欲しい理由を入力してください/);
});

test("欲しい理由が200文字を超えるとエラーになる", () => {
  assert.match(
    validateStoreItemRequest({ ...validDraft, reason: "あ".repeat(201) }),
    /欲しい理由は200文字以内で入力してください/,
  );
});
