import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const TAB_ROUTE_NAMES = ["main-adult", "tasks-adult", "store-adult", "loan-adult", "history", "settings"];

const layoutPath = path.resolve("app/(adult)/_layout.tsx");
const layoutSrc = fs.readFileSync(layoutPath, "utf8");

test("大人用タブレイアウト: 子供ロールと確定した場合のみSlotを返し、タブバーを表示しない", () => {
  assert.ok(layoutSrc.includes('role === "child"'), "子供ロールと確定した場合を判定しているはず");
  assert.ok(layoutSrc.includes("<Slot"), "子供ロールの場合はSlotで素通しするはず");
});

test("大人用タブレイアウト: ロール未確定（undefined）ではタブバーを消さない", () => {
  assert.ok(
    !layoutSrc.includes('role !== "parent"'),
    "ロール未確定時にタブバーが消えてしまう判定になっていないはず",
  );
});

test("大人用タブレイアウト: ホーム/タスク/ストア/ローン/履歴/設定の6タブを持つ", () => {
  for (const name of TAB_ROUTE_NAMES) {
    assert.ok(layoutSrc.includes(`name="${name}"`), `${name} タブが定義されているはず`);
  }
});

test("各画面ファイルが(adult)ルートグループ配下に移動している", () => {
  for (const name of TAB_ROUTE_NAMES) {
    assert.ok(
      fs.existsSync(path.resolve(`app/(adult)/${name}.tsx`)),
      `app/(adult)/${name}.tsx が存在するはず`,
    );
    assert.ok(
      !fs.existsSync(path.resolve(`app/${name}.tsx`)),
      `app/${name}.tsx は(adult)配下へ移動済みで存在しないはず`,
    );
  }
});

test("AdultBottomNavは削除されている（タブバーはTabsレイアウトに一本化）", () => {
  assert.ok(!fs.existsSync(path.resolve("components/nav/AdultBottomNav.tsx")));
});
