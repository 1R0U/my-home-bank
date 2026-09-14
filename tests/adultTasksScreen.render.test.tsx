import { render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

let mockParams: { tab?: string; questId?: string } = {};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/taskService", () => ({
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

import AdultTasksScreen from "../components/AdultTasksScreen";
import { useAppStore } from "../store";

const dailyQuest = {
  assigned_to: null,
  category: "daily" as const,
  created_at: "2026-07-01T00:00:00Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  description: "浴槽を洗う",
  id: "q1",
  reward_amount: 10,
  status: "open" as const,
  title: "お風呂掃除",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFetchQuests.mockResolvedValue([dailyQuest]);
  // isLiveをtrueにして実際に取得したクエスト（承認待ちゼロ件）だけを表示させ、
  // MOCK_QUESTSの承認待ち件数バッジで「承認」タブのラベルが変わらないようにする。
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
    },
  });
});

test("params付きで開いたときはそのタブ・クエストを表示する", async () => {
  mockParams = { questId: "q1", tab: "daily" };

  render(<AdultTasksScreen />);

  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "デイリー" }).props.accessibilityState.selected).toBe(true);
});

test("画面がマウントされたまま別のparamsで再遷移した場合、タブを更新する", async () => {
  mockParams = { questId: "q1", tab: "daily" };
  const { rerender } = render(<AdultTasksScreen />);
  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();

  mockParams = { tab: "weekly" };
  rerender(<AdultTasksScreen />);

  expect(screen.getByRole("tab", { name: "ウィークリー" }).props.accessibilityState.selected).toBe(true);
});

test("paramsが無い状態で再遷移した場合、前回の選択を残さずデフォルト（承認タブ）に戻る", async () => {
  mockParams = { questId: "q1", tab: "daily" };
  const { rerender } = render(<AdultTasksScreen />);
  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();

  mockParams = {};
  rerender(<AdultTasksScreen />);

  expect(screen.getByRole("tab", { name: "承認" }).props.accessibilityState.selected).toBe(true);
});
