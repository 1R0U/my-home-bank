import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSettings, getNameDraftState, updateSettings } from "../lib/settings.ts";

test("初期状態は指定した名前と通知オンで作られる", () => {
  const settings = createInitialSettings("たろう");

  assert.deepEqual(settings, { name: "たろう", notificationsEnabled: true });
});

test("一部のフィールドだけ更新できる", () => {
  const settings = createInitialSettings("たろう");
  const updated = updateSettings(settings, { notificationsEnabled: false });

  assert.deepEqual(updated, { name: "たろう", notificationsEnabled: false });
});

test("名前を更新しても通知設定は保持される", () => {
  const settings = updateSettings(createInitialSettings("たろう"), { notificationsEnabled: false });
  const updated = updateSettings(settings, { name: "はなこ" });

  assert.deepEqual(updated, { name: "はなこ", notificationsEnabled: false });
});

test("入力欄が現在の名前と同じなら保存できない", () => {
  const state = getNameDraftState("たろう", "たろう");

  assert.equal(state.canSave, false);
});

test("空文字や空白のみに変更した場合は保存できない", () => {
  assert.equal(getNameDraftState("", "たろう").canSave, false);
  assert.equal(getNameDraftState("   ", "たろう").canSave, false);
});

test("空白を含む有効な名前に変更した場合はトリムして保存できる", () => {
  const state = getNameDraftState("  はなこ  ", "たろう");

  assert.equal(state.canSave, true);
  assert.equal(state.trimmed, "はなこ");
});
