import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSettings, updateSettings } from "../lib/settings.ts";

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
