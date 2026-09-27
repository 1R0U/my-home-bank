import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBirthDateInput,
  formatGender,
  getProfileDraftState,
  isGender,
  parseBirthDateInput,
} from "../lib/profile.ts";

const today = new Date(2026, 8, 24); // 2026-09-24

test("生年月日はいくつかの書き方で入力でき、YYYY-MM-DD にそろう", () => {
  for (const input of ["2015/04/12", "2015/4/12", "2015-04-12", "2015.4.12", "20150412", " 2015/04/12 "]) {
    assert.deepEqual(parseBirthDateInput(input, today), { error: null, value: "2015-04-12" }, input);
  }
});

test("空欄は未設定（null）として扱う", () => {
  assert.deepEqual(parseBirthDateInput("", today), { error: null, value: null });
  assert.deepEqual(parseBirthDateInput("   ", today), { error: null, value: null });
});

test("書き方が違う・存在しない日付は理由を返す", () => {
  assert.match(parseBirthDateInput("2015年4月12日", today).error, /2015\/04\/12 のように/);
  assert.match(parseBirthDateInput("15/04/12", today).error, /2015\/04\/12 のように/);
  assert.equal(parseBirthDateInput("2015/02/30", today).error, "存在しない日付です");
  assert.equal(parseBirthDateInput("2015/13/01", today).error, "存在しない日付です");
  // うるう年
  assert.equal(parseBirthDateInput("2024/02/29", today).value, "2024-02-29");
  assert.equal(parseBirthDateInput("2023/02/29", today).error, "存在しない日付です");
});

test("今日までは入力でき、未来の日付は入力できない", () => {
  assert.equal(parseBirthDateInput("2026/09/24", today).value, "2026-09-24");
  assert.equal(parseBirthDateInput("2026/09/25", today).error, "未来の日付は入力できません");
});

test("1900年より前は入力できない（DB の制約と同じ下限）", () => {
  assert.equal(parseBirthDateInput("1900/01/01", today).value, "1900-01-01");
  assert.equal(parseBirthDateInput("1899/12/31", today).error, "1900年以降の日付を入力してください");
});

test("保存済みの生年月日を入力欄の形にする", () => {
  assert.equal(formatBirthDateInput("2015-04-12"), "2015/04/12");
  assert.equal(formatBirthDateInput(null), "");
});

test("性別は決めた3つだけを有効とし、表示名を返す", () => {
  assert.equal(isGender("male"), true);
  assert.equal(isGender("unknown"), false);
  assert.equal(isGender(null), false);
  assert.equal(formatGender("female"), "女性");
  assert.equal(formatGender(null), "未設定");
});

test("入力が正しく、保存済みから変わったときだけ保存できる", () => {
  const current = { birthDate: "2015-04-12", gender: "female" };
  // 書き方が違うだけで同じ日付なら、変わっていない
  assert.equal(getProfileDraftState("2015/4/12", "female", current, today).canSave, false);
  assert.equal(getProfileDraftState("2015/04/13", "female", current, today).canSave, true);
  assert.equal(getProfileDraftState("2015/04/12", "male", current, today).canSave, true);
  // 未設定に戻すのも保存できる
  assert.equal(getProfileDraftState("", null, current, today).canSave, true);
  // 入力が誤っていれば、性別を変えても保存できない
  assert.equal(getProfileDraftState("2015/02/30", "male", current, today).canSave, false);
});
