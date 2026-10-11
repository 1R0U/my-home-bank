import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { useAppStore } from "../store";

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
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

const mockFetchNotifications = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchUnreadNotificationCount = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/notificationService", () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  fetchUnreadNotificationCount: (...args: unknown[]) => mockFetchUnreadNotificationCount(...args),
  markNotificationsRead: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuests.mockResolvedValue([]);
  mockFetchUserBalance.mockResolvedValue(500);
  mockFetchUserFamilyId.mockResolvedValue(null);
  mockFetchGuildTreasury.mockResolvedValue(null);
  mockFetchNotifications.mockResolvedValue([]);
  mockFetchUnreadNotificationCount.mockResolvedValue(0);
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      family_id: "33333333-3333-3333-3333-333333333333",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
    },
  });
});

test("「我が家タウンへ行く」でRPGハブへ遷移する", () => {
  // Issue #246: 大人にはRPGハブへの入口が無かった
  render(<ParentHomeScreen />);

  fireEvent.press(screen.getByLabelText("我が家タウンへ行く"));

  expect(router.push).toHaveBeenCalledWith("/rpg-hub");
});

test("通知ベルで掲示板（お知らせの一覧）へ遷移する", () => {
  // Issue #354: 以前はタスク画面の承認待ちタブを開いていた
  render(<ParentHomeScreen />);

  fireEvent.press(screen.getByLabelText("通知"));

  expect(router.push).toHaveBeenCalledWith("/notifications");
});

test("承認待ちの行で、タスク画面の承認タブへ遷移する", async () => {
  // Issue #354: ベルは掲示板を開くようになったので、承認待ちへはこの行から行く
  mockFetchQuests.mockResolvedValue([
    {
      assigned_to: "22222222-2222-2222-2222-222222222222",
      category: "daily",
      created_at: "2026-07-01T00:00:00Z",
      created_by: "11111111-1111-1111-1111-111111111111",
      description: "",
      family_id: "33333333-3333-3333-3333-333333333333",
      id: "quest-pending",
      reward_amount: 10,
      status: "pending",
      title: "食器洗い",
    },
  ]);
  render(<ParentHomeScreen />);

  fireEvent.press(await screen.findByLabelText(/承認待ちのタスクが1件あります/));

  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ tab: "approval" }),
      pathname: "/tasks-adult",
    }),
  );
});

test("デイリータスクの「すべて見る」を連続で押しても、navKeyが重複せず毎回異なる値になる", () => {
  render(<ParentHomeScreen />);
  const seeAll = screen.getByLabelText("デイリータスクをすべて見る");

  fireEvent.press(seeAll);
  fireEvent.press(seeAll);

  expect(router.push).toHaveBeenCalledTimes(2);
  const [firstCall, secondCall] = (router.push as jest.Mock).mock.calls;
  const firstNavKey = (firstCall[0] as { params: { navKey: string } }).params.navKey;
  const secondNavKey = (secondCall[0] as { params: { navKey: string } }).params.navKey;
  expect(firstNavKey).not.toEqual(secondNavKey);
});
