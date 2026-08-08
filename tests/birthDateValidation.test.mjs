import assert from "node:assert/strict";
import test from "node:test";
import { validateBirthDate } from "../lib/birthDateValidation.ts";

const today = new Date(2026, 7, 8);

test("過去の正しい生年月日を受け付ける", () => {
  assert.equal(validateBirthDate("2015", "4", "12", today), undefined);
  assert.equal(validateBirthDate("2000", "02", "29", new Date(2028, 7, 8)), undefined);
});

test("未来の生年月日を拒否する", () => {
  assert.equal(validateBirthDate("2026", "8", "9", today), "未来の日付は入力できません。");
});

test("存在しない日付を拒否する", () => {
  assert.equal(
    validateBirthDate("2026", "2", "29", today),
    "存在しない日付です。生年月日を確認してください。",
  );
});

test("120歳を超える生年月日を拒否する", () => {
  assert.equal(
    validateBirthDate("1906", "8", "7", today),
    "120歳を超える生年月日は入力できません。",
  );
});
