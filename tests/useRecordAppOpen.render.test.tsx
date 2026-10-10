import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import { useRecordAppOpen } from "../lib/useRecordAppOpen";
import { useAppStore } from "../store";

const mockRecordAppOpen = jest.fn<() => Promise<boolean>>();
jest.mock("../lib/appOpenService", () => ({
  ...jest.requireActual<object>("../lib/appOpenService"),
  recordAppOpen: () => mockRecordAppOpen(),
}));

const PARENT_ID = "11111111-1111-1111-1111-111111111111";
const CHILD_ID = "22222222-2222-2222-2222-222222222222";

const baseUser = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
};

let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordAppOpen.mockResolvedValue(true);
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  useAppStore.setState({
    user: { ...baseUser, id: PARENT_ID, name: "お父さん", role: "parent" },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

/** アプリが前面に戻ったことにする */
async function comeBackToForeground() {
  await act(async () => {
    appStateListener?.("active");
  });
}

test("大人がログインしているとき、開いた日を記録する", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);
});

test("同じ日のうちに前面へ戻っても、もう一度は記録しない", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await comeBackToForeground();

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);
});

test("日本時間で日付が変わってから前面へ戻ると、その日の分を記録する", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-09T14:59:00Z"),
    doNotFake: ["nextTick", "setImmediate"],
  });
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  jest.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  await comeBackToForeground();

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(2);
});

test("記録に失敗したときは、次に前面へ戻ったときにもう一度試す", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockRecordAppOpen.mockRejectedValueOnce(new Error("network"));
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await comeBackToForeground();

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(2);
  warnSpy.mockRestore();
});

test("子供のときは記録しない（子供はタスクの承認で数える）", async () => {
  useAppStore.setState({
    user: { ...baseUser, id: CHILD_ID, name: "たろう", role: "child" },
  });
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  expect(mockRecordAppOpen).not.toHaveBeenCalled();
});

test("ログインしていないときと、モックの利用者（プレビュー）では記録しない", async () => {
  useAppStore.setState({ user: null });
  const { rerender } = renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  useAppStore.setState({
    user: {
      ...baseUser,
      id: "user-parent-1",
      name: "お父さん",
      role: "parent",
    },
  });
  rerender(undefined);
  await act(async () => undefined);

  expect(mockRecordAppOpen).not.toHaveBeenCalled();
});
