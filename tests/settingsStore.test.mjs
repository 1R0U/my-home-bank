import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialSettings,
  createInitialSettingsByRole,
  getNameDraftState,
  updateSettings,
  updateSettingsByRole,
} from "../lib/settings.ts";

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

test("初期化時に親・子それぞれの名前で設定が作られる", () => {
  const settingsByRole = createInitialSettingsByRole("お父さん", "たろう");

  assert.deepEqual(settingsByRole, {
    parent: { name: "お父さん", notificationsEnabled: true },
    child: { name: "たろう", notificationsEnabled: true },
  });
});

test("親の設定を更新しても子の設定は変わらない", () => {
  const settingsByRole = createInitialSettingsByRole("お父さん", "たろう");
  const updated = updateSettingsByRole(settingsByRole, "parent", { name: "新しい親の名前" });

  assert.equal(updated.parent.name, "新しい親の名前");
  assert.deepEqual(updated.child, settingsByRole.child);
});

test("子の設定を更新しても親の設定は変わらない", () => {
  const settingsByRole = createInitialSettingsByRole("お父さん", "たろう");
  const updated = updateSettingsByRole(settingsByRole, "child", { notificationsEnabled: false });

  assert.equal(updated.child.notificationsEnabled, false);
  assert.deepEqual(updated.parent, settingsByRole.parent);
});
