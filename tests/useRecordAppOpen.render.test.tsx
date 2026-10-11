import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import { useRecordAppOpen } from "../lib/useRecordAppOpen";
import { useAppStore } from "../store";

const mockRecordAppOpen = jest.fn<() => Promise<boolean>>();
const mockNotifyAppOpenRecorded = jest.fn();
jest.mock("../lib/appOpenService", () => ({
  // 0:00 までの時間の計算は本物を使う
  ...jest.requireActual<object>("../lib/appOpenService"),
  notifyAppOpenRecorded: () => mockNotifyAppOpenRecorded(),
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

/** アプリの状態が変わったことにする */
async function changeAppState(...states: AppStateStatus[]) {
  for (const state of states) {
    await act(async () => {
      appStateListener?.(state);
    });
  }
}

/** アプリを一度裏へ回してから、前面に戻したことにする */
async function comeBackToForeground() {
  await changeAppState("background", "active");
}

test("大人がログインしているとき、開いた日を記録する", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);
});

test("記録できたときは、書き込みが終わってから表示中の連続記録へ知らせる", async () => {
  let resolveRecord: (value: boolean) => void = () => undefined;
  mockRecordAppOpen.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRecord = resolve;
      }),
  );
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  // 書き込みが終わる前には知らせない（記録前の日数を取り直さないように）
  expect(mockNotifyAppOpenRecorded).not.toHaveBeenCalled();

  await act(async () => {
    resolveRecord(true);
  });

  expect(mockNotifyAppOpenRecorded).toHaveBeenCalledTimes(1);
});

test("すでに記録済み（別の端末で今日の分を先に記録した）でも知らせる", async () => {
  // この端末の掲示板は前日の日数のままなので、取り直させる
  mockRecordAppOpen.mockResolvedValue(false);
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  expect(mockNotifyAppOpenRecorded).toHaveBeenCalledTimes(1);
});

test("記録に失敗したときは知らせない", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockRecordAppOpen.mockRejectedValue(new Error("network"));
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  expect(mockNotifyAppOpenRecorded).not.toHaveBeenCalled();
  warnSpy.mockRestore();
});

test("裏から前面へ戻るたびに記録を依頼する（同じ日の分はDBがまとめる。端末の日付ではまとめない）", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await comeBackToForeground();
  await comeBackToForeground();

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(3);
});

test("前面へ戻った以外の変化（裏へ回ったなど）では記録しない", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await changeAppState("background");

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);
});

test("コントロールセンターなどを下ろして戻っただけ（inactive → active）では記録しない", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await changeAppState("inactive", "active");

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);
  expect(mockNotifyAppOpenRecorded).toHaveBeenCalledTimes(1);
});

test("裏から戻るときに inactive を挟んでも、裏へ回っていれば記録する", async () => {
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await changeAppState("inactive", "background", "inactive", "active");

  expect(mockRecordAppOpen).toHaveBeenCalledTimes(2);
});

test("前面に出したまま日本時間の 0:00 をまたぐと、少し待ってから記録し直す", async () => {
  // 日本時間 23:59:50
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"], now: new Date("2026-10-10T14:59:50Z") });
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);
  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);

  // 0:00 ちょうどでは、DBの時計がまだ前の日かもしれないので呼ばない
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);

  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });
  expect(mockRecordAppOpen).toHaveBeenCalledTimes(2);

  // 次の日の 0:00 にも、また呼び直す
  await act(async () => {
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
  });
  expect(mockRecordAppOpen).toHaveBeenCalledTimes(3);
});

test("裏へ回っている間は、0:00 のタイマーを止める（戻ったときに記録する）", async () => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"], now: new Date("2026-10-10T14:59:50Z") });
  renderHook(() => useRecordAppOpen());
  await act(async () => undefined);

  await changeAppState("background");
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(mockRecordAppOpen).toHaveBeenCalledTimes(1);

  await changeAppState("active");
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
