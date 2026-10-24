import { render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

const mockUseActiveRole = jest.fn<() => string | undefined>();
jest.mock("../store", () => ({
  useActiveRole: () => mockUseActiveRole(),
}));

const mockSlot = jest.fn();
const mockTabsScreen = jest.fn<(name: string, options: Record<string, unknown> | undefined) => void>();

jest.mock("expo-router", () => {
  function Slot() {
    mockSlot();
    return null;
  }
  function Tabs({ children }: { children: ReactNode }) {
    return children;
  }
  Tabs.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    mockTabsScreen(name, options);
    return null;
  };
  return { Slot, Tabs };
});

import AdultTabsLayout from "../app/(adult)/_layout";

// タブに出す5画面（Issue #320で設定を外した）。
const VISIBLE_TAB_ROUTE_NAMES = ["loan-adult", "store-adult", "main-adult", "tasks-adult", "history-adult"];

beforeEach(() => {
  jest.clearAllMocks();
});

test("親ロールの場合はTabsを描画し、5タブすべてを登録する", async () => {
  mockUseActiveRole.mockReturnValue("parent");

  await render(<AdultTabsLayout />);

  expect(mockSlot).not.toHaveBeenCalled();
  for (const name of VISIBLE_TAB_ROUTE_NAMES) {
    expect(mockTabsScreen).toHaveBeenCalledWith(name, expect.anything());
  }
});

test("設定はTabsに登録せず、タブは5つだけにする（ルート直下のStack画面。Issue #320・#498）", async () => {
  mockUseActiveRole.mockReturnValue("parent");

  await render(<AdultTabsLayout />);

  // 隠しタブにすると、SDKの更新のたびに開けない（#485）・タブがずれる（#498）が起きていた
  expect(mockTabsScreen.mock.calls.map(([name]) => name)).toEqual(VISIBLE_TAB_ROUTE_NAMES);
});

test("(adult)グループには、タブに出す5画面のファイルだけを置く（Issue #498）", () => {
  // グループ内のファイルはExpo Routerが自動でタブへ足すので、タブに出さない画面はグループの外に置く
  const routeFiles = readdirSync(join(__dirname, "../app/(adult)"))
    .filter((file) => file !== "_layout.tsx")
    .map((file) => file.replace(/\.tsx$/, ""));
  expect(routeFiles.sort()).toEqual([...VISIBLE_TAB_ROUTE_NAMES].sort());
});

test("子供ロールと確定した場合はSlotを描画し、タブバーを表示しない", async () => {
  mockUseActiveRole.mockReturnValue("child");

  await render(<AdultTabsLayout />);

  expect(mockSlot).toHaveBeenCalledTimes(1);
  expect(mockTabsScreen).not.toHaveBeenCalled();
});

test("ロール未確定（undefined）の間はタブバーを消さない", async () => {
  mockUseActiveRole.mockReturnValue(undefined);

  await render(<AdultTabsLayout />);

  expect(mockSlot).not.toHaveBeenCalled();
  for (const name of VISIBLE_TAB_ROUTE_NAMES) {
    expect(mockTabsScreen).toHaveBeenCalledWith(name, expect.anything());
  }
});
