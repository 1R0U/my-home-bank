import assert from "node:assert/strict";
import test from "node:test";
import { isUuid } from "../lib/uuid.ts";

test("isUuid は UUID 文字列を true と判定する", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  // 大文字も許容する
  assert.equal(isUuid("123E4567-E89B-12D3-A456-426614174000"), true);
});

test("isUuid はモックID・非UUID文字列を false と判定する", () => {
  assert.equal(isUuid("user-parent-1"), false);
  assert.equal(isUuid("user-child-1"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("123e4567-e89b-12d3-a456"), false);
  assert.equal(isUuid("123e4567e89b12d3a456426614174000"), false);
});

test("isUuid は文字列以外を false と判定する", () => {
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(12345), false);
});
