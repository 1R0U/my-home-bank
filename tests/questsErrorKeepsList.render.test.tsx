import { render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  useLocalSearchParams: () => ({}),
}));

// 取得済みの一覧とエラーが同時にある状態を作る。
// useQuests は失敗しても quests を消さないため、実際に起こりうる組み合わせ
// （タスク追加や承認のあとの再取得だけが失敗した場合）。
const mockQuestsResult = {
  error: null as string | null,
  isLive: true,
  loading: false,
  quests: [] as unknown[],
  reload: jest.fn(),
};

jest.mock("../lib/useQuests", () => ({
  useQuests: () => mockQuestsResult,
}));

jest.mock("../lib/userService", () => ({
  fetchUserBalance: jest.fn(() => Promise.resolve(0)),
  fetchUserFamilyId: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("../lib/treasuryService", () => ({
  fetchGuildTreasury: jest.fn(() => Promise.resolve(null)),
}));

import AdultTasksScreen from "../components/AdultTasksScreen";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { useAppStore } from "../store";

const quest = {
  assigned_to: null,
  category: "daily" as const,
  created_at: "2026-07-01T00:00:00Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  description: "浴槽を洗う",
  id: "quest-1",
  reward_amount: 50,
  status: "open" as const,
  title: "お風呂掃除",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuestsResult.error = null;
  mockQuestsResult.quests = [];
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

test("大人ホーム: 再取得に失敗しても、取得済みのタスクを消さない", () => {
  mockQuestsResult.error = "network error";
  mockQuestsResult.quests = [quest];

  render(<ParentHomeScreen />);

  expect(screen.getByText("タスクを取得できませんでした")).toBeTruthy();
  // エラーだけ出して一覧を消すと、取得済みの正しいデータを見る手段がなくなる
  expect(screen.getByText("お風呂掃除")).toBeTruthy();
  // 中身があるので「ありません」は出さない
  expect(screen.queryByText("デイリータスクはありません")).toBeNull();
});

test("大人タスク: 再取得に失敗しても、取得済みのタスクを消さない", () => {
  mockQuestsResult.error = "network error";
  // 既定のタブは「承認待ち」なので、そこに出る status で用意する
  mockQuestsResult.quests = [{ ...quest, status: "pending" }];

  render(<AdultTasksScreen />);

  expect(screen.getByText("タスクを取得できませんでした")).toBeTruthy();
  expect(screen.getByText("お風呂掃除")).toBeTruthy();
  expect(screen.queryByText("タスクがありません")).toBeNull();
});

test("取得に成功して0件なら、エラーではなく空メッセージを出す", () => {
  render(<ParentHomeScreen />);

  expect(screen.getByText("デイリータスクはありません")).toBeTruthy();
  expect(screen.queryByText("タスクを取得できませんでした")).toBeNull();
});
