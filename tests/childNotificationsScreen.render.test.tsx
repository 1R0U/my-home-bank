import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ChildNotificationsScreen from "../components/ChildNotificationsScreen";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";
import { useAppStore } from "../store";
import { getByFuriganaText, queryByFuriganaText } from "./furiganaQueries";
import { iconButtonName } from "./iconButtonName";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchNotifications = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchUnreadNotificationCount = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockMarkNotificationsRead = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/notificationService", () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  fetchUnreadNotificationCount: (...args: unknown[]) => mockFetchUnreadNotificationCount(...args),
  markNotificationsRead: (...args: unknown[]) => mockMarkNotificationsRead(...args),
}));

const mockFetchFamilyMembers = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/userService", () => ({
  fetchFamilyMembers: (...args: unknown[]) => mockFetchFamilyMembers(...args),
}));

const mockFetchQuestStreak = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/questStreakService", () => ({
  fetchQuestStreak: (...args: unknown[]) => mockFetchQuestStreak(...args),
}));

const PARENT_ID = "11111111-1111-1111-1111-111111111111";
const CHILD_ID = "22222222-2222-2222-2222-222222222222";
const SISTER_ID = "44444444-4444-4444-4444-444444444444";

const baseUser = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
};

function makeNotification(overrides: Record<string, unknown>) {
  return {
    body: "",
    created_at: "2026-10-07T00:00:00Z",
    id: "n-1",
    read_at: null,
    route: null,
    title: "お知らせ",
    user_id: CHILD_ID,
    ...overrides,
  };
}

const unreadTask = makeNotification({
  body: "おふろそうじ",
  created_at: "2026-10-07T01:00:00Z",
  id: "n-task",
  route: "tasks",
  title: "新しいタスクがあります",
});
const unreadPlain = makeNotification({ id: "n-plain", title: "ようこそ" });
const readStore = makeNotification({
  created_at: "2026-10-06T00:00:00Z",
  id: "n-store",
  read_at: "2026-10-06T01:00:00Z",
  route: "store",
  title: "新しい商品が並びました",
});

function makeStreak(currentDays: number) {
  return { currentDays, lastActiveOn: null, pendingMilestone: null, startedOn: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNotifications.mockResolvedValue([unreadPlain, readStore, unreadTask]);
  mockFetchUnreadNotificationCount.mockResolvedValue(2);
  mockMarkNotificationsRead.mockResolvedValue(1);
  mockFetchFamilyMembers.mockResolvedValue([]);
  mockFetchQuestStreak.mockResolvedValue(makeStreak(0));
  useAppStore.setState({ user: { ...baseUser, id: CHILD_ID, name: "たろう", role: "child" } });
});

test("掲示板に、未読のお知らせだけを新しい順に留める", async () => {
  await render(<ChildNotificationsScreen />);

  await waitFor(() => expect(screen.getByLabelText("未読。新しいタスクがあります")).toBeTruthy());
  expect(screen.getByLabelText("未読。ようこそ")).toBeTruthy();
  expect(screen.queryByText("新しい商品が並びました")).toBeNull();
  expect(screen.getByLabelText("未読 2件")).toBeTruthy();
  expect(screen.getByLabelText("既読 1件")).toBeTruthy();
  expect(screen.getByLabelText("未読のお知らせ 2件")).toBeTruthy();
  // 未読の紙には「あたらしい」のはんこを押す
  expect(screen.getAllByText("あたらしい")).toHaveLength(2);

  const titles = screen.getAllByRole("button").map((button) => button.props.accessibilityLabel);
  expect(titles.indexOf("未読。新しいタスクがあります")).toBeLessThan(titles.indexOf("未読。ようこそ"));
});

test("既読タブへ切り替えると、既読のお知らせだけを出し、はんこは押さない", async () => {
  await render(<ChildNotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("既読 1件")).toBeTruthy());

  await fireEvent.press(screen.getByLabelText("既読 1件"));

  expect(screen.getByLabelText("新しい商品が並びました")).toBeTruthy();
  expect(screen.queryByText("ようこそ")).toBeNull();
  expect(screen.queryByText("あたらしい")).toBeNull();
  expect(screen.queryByRole("button", { name: "すべて既読にする" })).toBeNull();
});

test("お知らせを押すと既読になり、子供用の画面を開く", async () => {
  await render(<ChildNotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。新しいタスクがあります")).toBeTruthy());

  await act(async () => {
    await fireEvent.press(screen.getByLabelText("未読。新しいタスクがあります"));
  });

  expect(mockFetchNotifications).toHaveBeenCalledWith(CHILD_ID);
  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(["n-task"]);
  expect(router.push).toHaveBeenCalledWith("/tasks-child");
});

test("ストアのお知らせは、子供用のストアを開く", async () => {
  await render(<ChildNotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("既読 1件")).toBeTruthy());
  await fireEvent.press(screen.getByLabelText("既読 1件"));

  await act(async () => {
    await fireEvent.press(screen.getByLabelText("新しい商品が並びました"));
  });

  expect(mockMarkNotificationsRead).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith("/store-child");
});

test("行き先の無いお知らせは、既読にするだけで画面は移らない", async () => {
  await render(<ChildNotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。ようこそ")).toBeTruthy());

  await act(async () => {
    await fireEvent.press(screen.getByLabelText("未読。ようこそ"));
  });

  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(["n-plain"]);
  expect(router.push).not.toHaveBeenCalled();
});

test("「すべて既読にする」で未読をすべて既読にする", async () => {
  const readAt = "2026-10-07T02:00:00Z";
  mockFetchNotifications
    .mockResolvedValueOnce([unreadPlain, readStore, unreadTask])
    .mockResolvedValue([{ ...unreadPlain, read_at: readAt }, readStore, { ...unreadTask, read_at: readAt }]);
  mockFetchUnreadNotificationCount.mockResolvedValueOnce(2).mockResolvedValue(0);
  await render(<ChildNotificationsScreen />);
  await waitFor(() => expect(screen.getByRole("button", { name: "すべて既読にする" })).toBeTruthy());

  await act(async () => {
    await fireEvent.press(screen.getByRole("button", { name: "すべて既読にする" }));
  });

  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(null);
  expect(screen.getByLabelText("未読 0件")).toBeTruthy();
  expect(getByFuriganaText("未読のお知らせはないよ")).toBeTruthy();
});

test("取得に失敗したときはエラーを出し、「ないよ」とは出さない", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchNotifications.mockRejectedValue(new Error("network"));

  await render(<ChildNotificationsScreen />);

  await waitFor(() => expect(screen.getByText("お知らせを取得できませんでした")).toBeTruthy());
  expect(queryByFuriganaText("未読のお知らせはないよ")).toBeNull();
  warnSpy.mockRestore();
});

test("一覧の取得上限を超える未読があっても、本当の件数を出して案内する", async () => {
  mockFetchUnreadNotificationCount.mockResolvedValue(150);

  await render(<ChildNotificationsScreen />);

  await waitFor(() => expect(screen.getByLabelText("未読 150件")).toBeTruthy());
  expect(getByFuriganaText("新しい100件までを表示しています")).toBeTruthy();
});

test("家族の連続記録を、自分を先頭にして掲示板に留める", async () => {
  mockFetchFamilyMembers.mockResolvedValue([
    { id: PARENT_ID, name: "お父さん", role: "parent" },
    { id: CHILD_ID, name: "たろう", role: "child" },
    { id: SISTER_ID, name: "はなこ", role: "child" },
  ]);
  const days: Record<string, number> = { [CHILD_ID]: 5, [PARENT_ID]: 1, [SISTER_ID]: 0 };
  mockFetchQuestStreak.mockImplementation(async (id) => makeStreak(days[id as string]));

  await render(<ChildNotificationsScreen />);

  await waitFor(() => expect(screen.getByText("5日 連続")).toBeTruthy());
  const order = screen.getAllByTestId(/^quest-streak-/).map((row) => row.props.testID.replace("quest-streak-", ""));
  expect(order).toEqual([CHILD_ID, SISTER_ID, PARENT_ID]);
  expect(screen.getByLabelText("たろう（じぶん）、5日 連続、次の「1しゅうかん」まで あと2日")).toBeTruthy();
  expect(screen.getByLabelText("はなこ、今日からスタート、次の「3日」まで あと3日")).toBeTruthy();
});

test("モックの利用者（プレビュー）では取得せず、その旨を出す", async () => {
  useAppStore.setState({ user: { ...baseUser, id: "user-child-1", name: "たろう", role: "child" } });

  await render(<ChildNotificationsScreen />);
  await act(async () => undefined);

  expect(mockFetchNotifications).not.toHaveBeenCalled();
  expect(mockFetchFamilyMembers).not.toHaveBeenCalled();
  expect(getByFuriganaText("※ プレビュー中はお知らせを表示できません")).toBeTruthy();
});

test("戻るボタンで前の画面へ戻る", async () => {
  await render(<ChildNotificationsScreen />);
  await act(async () => undefined);

  await fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(router.back).toHaveBeenCalled();
});

test("子供の掲示板の紹介は戻るボタンを囲み、戻る操作で進む", async () => {
  useAppStore.setState({ user: { ...baseUser, id: CHILD_ID, name: "こども", role: "child" } });
  mockFetchNotifications.mockResolvedValue([]);
  mockFetchUnreadNotificationCount.mockResolvedValue(0);
  const tutorial: TutorialContextValue = {
    role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child.find((step) => step.id === "child-board-back"),
    storageError: false, home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn(),
  };
  await render(<TutorialContext.Provider value={tutorial}><ChildNotificationsScreen /></TutorialContext.Provider>);
  await act(async () => undefined);
  expect(tutorial.advance).not.toHaveBeenCalled();
  expect(screen.getByTestId("tutorial-frame-child-board-back")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("前の画面に戻る"));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(tutorial.advance).toHaveBeenCalledWith("child-board-back");
});

test("子供には「家事をしなくていい日」の入口を出さない（Issue #396）", async () => {
  await render(<ChildNotificationsScreen />);
  await act(async () => undefined);

  expect(screen.queryByRole("button", { name: iconButtonName("家事をしなくていい日を決める") })).toBeNull();
});
