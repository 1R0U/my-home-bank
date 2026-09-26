import { act, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockFocusCallbacks: (() => void)[] = [];

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      mockFocusCallbacks.push(effect);
      effect();
    }, []);
  },
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/taskService", () => ({
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchUserFamilyId = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
  fetchUserFamilyId: (...args: unknown[]) => mockFetchUserFamilyId(...args),
}));

const mockFetchGuildTreasury = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/treasuryService", () => ({
  fetchGuildTreasury: (...args: unknown[]) => mockFetchGuildTreasury(...args),
}));

import ParentHomeScreen from "../components/ParentHomeScreen";
import { useAppStore } from "../store";

const PARENT_ID = "11111111-1111-1111-1111-111111111111";

const parent = {
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
  id: PARENT_ID,
  name: "お父さん",
  role: "parent" as const,
};

const openQuest = {
  assigned_to: null,
  category: "daily" as const,
  created_at: "2026-07-01T00:00:00Z",
  created_by: PARENT_ID,
  description: "浴槽を洗う",
  family_id: "33333333-3333-3333-3333-333333333333",
  id: "quest-1",
  reward_amount: 10,
  status: "open" as const,
  title: "お風呂掃除",
};

const pendingQuest = {
  ...openQuest,
  assigned_to: "22222222-2222-2222-2222-222222222222",
  id: "quest-2",
  status: "pending" as const,
  title: "食器洗い",
};

function refocus() {
  return act(async () => {
    for (const callback of mockFocusCallbacks) callback();
  });
}

const FAMILY_ID = "33333333-3333-3333-3333-333333333333";

function makeTreasury(balance: number) {
  return {
    balance,
    created_at: "2026-07-01T00:00:00Z",
    family_id: FAMILY_ID,
    id: "treasury-1",
    initial_supply: 5000,
    minimum_reserve_rate: 0.1,
    total_supply: 5000,
    updated_at: "2026-07-01T00:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.length = 0;
  useAppStore.setState({ user: parent });
  mockFetchUserFamilyId.mockResolvedValue(FAMILY_ID);
  mockFetchGuildTreasury.mockResolvedValue(makeTreasury(1000));
});

test("他タブでの操作後にホームタブへ再フォーカスすると、残高・承認待ち件数を再取得する", async () => {
  mockFetchUserBalance.mockResolvedValueOnce(500);
  mockFetchQuests.mockResolvedValueOnce([openQuest]);

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("500 gol");
  });
  expect(screen.queryByLabelText(/承認待ち/)).toBeNull();

  // 他タブでタスクを承認した結果、残高が増え承認待ちが1件発生した状況を再現する
  mockFetchUserBalance.mockResolvedValueOnce(560);
  mockFetchQuests.mockResolvedValueOnce([{ ...openQuest, status: "completed" }, pendingQuest]);

  await refocus();

  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("560 gol");
  });
  expect(screen.getByLabelText(/承認待ちが1件/)).toBeTruthy();
  expect(mockFetchUserBalance).toHaveBeenCalledTimes(2);
  expect(mockFetchQuests).toHaveBeenCalledTimes(2);
});

test("他タブでのゴル発行後にホームタブへ再フォーカスすると、ギルド金庫残高を再取得する（Issue #233）", async () => {
  mockFetchUserBalance.mockResolvedValue(500);
  mockFetchQuests.mockResolvedValue([]);
  mockFetchGuildTreasury.mockResolvedValueOnce(makeTreasury(1000));

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByLabelText(/ギルド金庫残高 1,000ゴル/)).toBeTruthy();
  });

  mockFetchGuildTreasury.mockResolvedValueOnce(makeTreasury(1500));

  await refocus();

  await waitFor(() => {
    expect(screen.getByLabelText(/ギルド金庫残高 1,500ゴル/)).toBeTruthy();
  });
  expect(mockFetchGuildTreasury).toHaveBeenCalledTimes(2);
});
