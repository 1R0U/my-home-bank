import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import NotificationsScreen from "../components/NotificationsScreen";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchNotifications = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockMarkNotificationsRead = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/notificationService", () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  markNotificationsRead: (...args: unknown[]) => mockMarkNotificationsRead(...args),
}));

const PARENT_ID = "11111111-1111-1111-1111-111111111111";
const CHILD_ID = "22222222-2222-2222-2222-222222222222";

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
    user_id: PARENT_ID,
    ...overrides,
  };
}

const unreadTask = makeNotification({
  body: "おふろそうじ",
  created_at: "2026-10-07T01:00:00Z",
  id: "n-task",
  route: "tasks",
  title: "承認待ちのタスクがあります",
});
const unreadPlain = makeNotification({ created_at: "2026-10-07T00:00:00Z", id: "n-plain", title: "ようこそ" });
const readStore = makeNotification({
  created_at: "2026-10-06T00:00:00Z",
  id: "n-store",
  read_at: "2026-10-06T01:00:00Z",
  route: "store",
  title: "新しい商品が並びました",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNotifications.mockResolvedValue([unreadPlain, readStore, unreadTask]);
  mockMarkNotificationsRead.mockResolvedValue(1);
  useAppStore.setState({ user: { ...baseUser, id: PARENT_ID, name: "お父さん", role: "parent" } });
});

test("最初は未読タブで、未読のお知らせだけを新しい順に出す", async () => {
  render(<NotificationsScreen />);

  await waitFor(() => {
    expect(screen.getByLabelText("未読。承認待ちのタスクがあります")).toBeTruthy();
  });
  expect(screen.getByLabelText("未読。ようこそ")).toBeTruthy();
  expect(screen.queryByText("新しい商品が並びました")).toBeNull();
  expect(screen.getByLabelText("未読 2件")).toBeTruthy();
  expect(screen.getByLabelText("既読 1件")).toBeTruthy();

  const titles = screen.getAllByRole("button").map((button) => button.props.accessibilityLabel);
  expect(titles.indexOf("未読。承認待ちのタスクがあります")).toBeLessThan(titles.indexOf("未読。ようこそ"));
});

test("既読タブへ切り替えると、既読のお知らせだけを出す", async () => {
  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("既読 1件")).toBeTruthy());

  fireEvent.press(screen.getByLabelText("既読 1件"));

  expect(screen.getByLabelText("新しい商品が並びました")).toBeTruthy();
  expect(screen.queryByText("ようこそ")).toBeNull();
  expect(screen.queryByText("すべて既読にする")).toBeNull();
});

test("未読のお知らせを押すと既読になり、行き先の画面（大人用）を開く", async () => {
  // 既読にした後の取り直しでは、DBで既読になった一覧が返る
  mockFetchNotifications
    .mockResolvedValueOnce([unreadPlain, readStore, unreadTask])
    .mockResolvedValue([unreadPlain, readStore, { ...unreadTask, read_at: "2026-10-07T02:00:00Z" }]);
  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。承認待ちのタスクがあります")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText("未読。承認待ちのタスクがあります"));
  });

  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(["n-task"]);
  expect(router.push).toHaveBeenCalledWith("/tasks-adult");
  await waitFor(() => expect(screen.getByLabelText("未読 1件")).toBeTruthy());
});

test("子供が押したときは、子供用の画面を開く", async () => {
  useAppStore.setState({ user: { ...baseUser, id: CHILD_ID, name: "たろう", role: "child" } });
  mockFetchNotifications.mockResolvedValue([{ ...unreadTask, user_id: CHILD_ID }]);

  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。承認待ちのタスクがあります")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText("未読。承認待ちのタスクがあります"));
  });

  expect(mockFetchNotifications).toHaveBeenCalledWith(CHILD_ID);
  expect(router.push).toHaveBeenCalledWith("/tasks-child");
});

test("行き先の無いお知らせは、既読にするだけで画面は移らない", async () => {
  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。ようこそ")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText("未読。ようこそ"));
  });

  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(["n-plain"]);
  expect(router.push).not.toHaveBeenCalled();
});

test("既読のお知らせを押しても、既読の操作は送らない", async () => {
  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("既読 1件")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("既読 1件"));

  await act(async () => {
    fireEvent.press(screen.getByLabelText("新しい商品が並びました"));
  });

  expect(mockMarkNotificationsRead).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith("/store-adult");
});

test("「すべて既読にする」で未読をすべて既読にする", async () => {
  const readAt = "2026-10-07T02:00:00Z";
  mockFetchNotifications
    .mockResolvedValueOnce([unreadPlain, readStore, unreadTask])
    .mockResolvedValue([{ ...unreadPlain, read_at: readAt }, readStore, { ...unreadTask, read_at: readAt }]);
  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByText("すべて既読にする")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText("すべて既読にする"));
  });

  expect(mockMarkNotificationsRead).toHaveBeenCalledWith(null);
  expect(screen.getByLabelText("未読 0件")).toBeTruthy();
  expect(screen.getByText("未読のお知らせはありません")).toBeTruthy();
});

test("既読にできなかったときは、取り直してDBの状態（未読）へ戻す", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockMarkNotificationsRead.mockRejectedValue(new Error("network"));

  render(<NotificationsScreen />);
  await waitFor(() => expect(screen.getByLabelText("未読。ようこそ")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText("未読。ようこそ"));
  });

  await waitFor(() => expect(screen.getByLabelText("未読 2件")).toBeTruthy());
  expect(mockFetchNotifications).toHaveBeenCalledTimes(2);
  warnSpy.mockRestore();
});

test("取得に失敗したときはエラーを出し、「ありません」とは出さない", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchNotifications.mockRejectedValue(new Error("network"));

  render(<NotificationsScreen />);

  await waitFor(() => expect(screen.getByText("お知らせを取得できませんでした")).toBeTruthy());
  expect(screen.queryByText("未読のお知らせはありません")).toBeNull();
  warnSpy.mockRestore();
});

test("モックの利用者（プレビュー）では取得せず、その旨を出す", async () => {
  useAppStore.setState({ user: { ...baseUser, id: "user-parent-1", name: "お父さん", role: "parent" } });

  render(<NotificationsScreen />);
  await act(async () => undefined);

  expect(mockFetchNotifications).not.toHaveBeenCalled();
  expect(screen.getByText("※ プレビュー中はお知らせを表示できません")).toBeTruthy();
});
