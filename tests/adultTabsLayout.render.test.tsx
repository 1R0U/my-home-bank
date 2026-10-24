import { render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
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

test("親ロールの場合はTabsを描画し、5タブすべてを登録する", () => {
  mockUseActiveRole.mockReturnValue("parent");

  render(<AdultTabsLayout />);

  expect(mockSlot).not.toHaveBeenCalled();
  for (const name of VISIBLE_TAB_ROUTE_NAMES) {
    expect(mockTabsScreen).toHaveBeenCalledWith(name, expect.anything());
  }
});

test("設定はタブバーに出さない（ボタンだけを消し、ルート自体は登録する。Issue #320・#485）", () => {
  mockUseActiveRole.mockReturnValue("parent");

  render(<AdultTabsLayout />);

  const options = mockTabsScreen.mock.calls.find(([name]) => name === "settings-adult")?.[1] as { href?: unknown; tabBarButton?: () => unknown };
  // href: null はSDK 58から開けない隠しタブになるため使わない
  expect(options?.href).toBeUndefined();
  expect(options?.tabBarButton?.()).toBeNull();
});

test("子供ロールと確定した場合はSlotを描画し、タブバーを表示しない", () => {
  mockUseActiveRole.mockReturnValue("child");

  render(<AdultTabsLayout />);

  expect(mockSlot).toHaveBeenCalledTimes(1);
  expect(mockTabsScreen).not.toHaveBeenCalled();
});

test("ロール未確定（undefined）の間はタブバーを消さない", () => {
  mockUseActiveRole.mockReturnValue(undefined);

  render(<AdultTabsLayout />);

  expect(mockSlot).not.toHaveBeenCalled();
  for (const name of VISIBLE_TAB_ROUTE_NAMES) {
    expect(mockTabsScreen).toHaveBeenCalledWith(name, expect.anything());
  }
});
