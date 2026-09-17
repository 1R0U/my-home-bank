import { render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { ReactNode } from "react";

const mockUseActiveRole = jest.fn<() => string | undefined>();
jest.mock("../store", () => ({
  useActiveRole: () => mockUseActiveRole(),
}));

const mockSlot = jest.fn();
const mockTabsScreen = jest.fn<(name: string) => void>();

jest.mock("expo-router", () => {
  function Slot() {
    mockSlot();
    return null;
  }
  function Tabs({ children }: { children: ReactNode }) {
    return children;
  }
  Tabs.Screen = ({ name }: { name: string }) => {
    mockTabsScreen(name);
    return null;
  };
  return { Slot, Tabs };
});

import AdultTabsLayout from "../app/(adult)/_layout";

const TAB_ROUTE_NAMES = ["loan-adult", "store-adult", "main-adult", "tasks-adult", "history", "settings"];

beforeEach(() => {
  jest.clearAllMocks();
});

test("親ロールの場合はTabsを描画し、6タブすべてを登録する", () => {
  mockUseActiveRole.mockReturnValue("parent");

  render(<AdultTabsLayout />);

  expect(mockSlot).not.toHaveBeenCalled();
  expect(mockTabsScreen).toHaveBeenCalledTimes(TAB_ROUTE_NAMES.length);
  for (const name of TAB_ROUTE_NAMES) {
    expect(mockTabsScreen).toHaveBeenCalledWith(name);
  }
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
  expect(mockTabsScreen).toHaveBeenCalledTimes(TAB_ROUTE_NAMES.length);
});
