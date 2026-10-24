import { act, renderHook, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import { clearResourceCache } from "../lib/resourceCache";
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]) }));
jest.mock("../lib/taskService", () => ({ fetchQuests: (...args: unknown[]) => mockFetch(...args) }));
import { useQuests } from "../lib/useQuests";
const child = { id: "11111111-1111-4111-8111-111111111263", family_id: "10000000-0000-4000-8000-000000000263", name: "子", role: "child" as const, balance: 0, created_at: "2026-10-01" };
beforeEach(() => { jest.clearAllMocks(); clearResourceCache(); useAppStore.setState({ user: child }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
test("同じ家庭のキャッシュを使っても別の子の担当を表示せず、親は全員を見られる", async () => {
  const rows = [{ id: "first", audience: "first" }, { id: "a", audience: "all", target_child_id: child.id }, { id: "b", audience: "specific", target_child_id: "b" }];
  mockFetch.mockResolvedValue(rows);
  const { result } = await renderHook(() => useQuests());
  await waitFor(() => expect(result.current.quests.map(q => q.id)).toEqual(["first", "a"]));
  await act(() => useAppStore.setState({ user: { ...child, id: "b" } }));
  expect(result.current.quests.map(q => q.id)).toEqual(["first", "b"]);
  await act(() => useAppStore.setState({ user: { ...child, role: "parent" } }));
  expect(result.current.quests).toEqual(rows);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
test("過去の承認待ちを残しながら、画面を開いたまま現在の期間の終了時刻に取り直す", async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-24T08:59:59Z"));
  const previous = { id: "previous", recurrence_source_id: "source", period_ends_at: "2026-10-23T09:00:00Z", status: "pending" };
  const current = { id: "current", recurrence_source_id: "source", period_ends_at: "2026-10-24T09:00:00Z" };
  const next = { id: "next", recurrence_source_id: "source", period_ends_at: "2026-10-25T09:00:00Z" };
  mockFetch.mockResolvedValueOnce([previous, current]).mockResolvedValueOnce([previous, next]);
  const { result } = await renderHook(() => useQuests());
  await waitFor(() => expect(result.current.quests).toHaveLength(2));
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(result.current.quests.map(q => q.id)).toEqual(["previous", "next"]);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("期間終了時の取得が連続して失敗しても1分ごとに再試行し、成功後は次の終了時刻を待つ", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-24T08:59:59Z"));
  const current = { id: "current", recurrence_source_id: "source", period_ends_at: "2026-10-24T09:00:00Z" };
  const next = { id: "next", recurrence_source_id: "source", period_ends_at: "2026-10-25T09:00:00Z" };
  mockFetch.mockResolvedValueOnce([current])
    .mockRejectedValueOnce(new Error("通信失敗"))
    .mockRejectedValueOnce(new Error("通信失敗"))
    .mockResolvedValue([next]);
  const { result } = await renderHook(() => useQuests());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(result.current.quests).toEqual([current]);
  expect(result.current.error).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(59_999); });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(mockFetch).toHaveBeenCalledTimes(3);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockFetch).toHaveBeenCalledTimes(4);
  expect(result.current.quests).toEqual([next]);
  expect(result.current.error).toBeNull();
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockFetch).toHaveBeenCalledTimes(4);
});

test("期間切替の取得中に画面を閉じたら、応答後にも再試行タイマーを残さない", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-24T08:59:59Z"));
  const current = { id: "current", period_ends_at: "2026-10-24T09:00:00Z" };
  let fail: (cause: Error) => void;
  mockFetch.mockResolvedValueOnce([current]).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  const { unmount } = await renderHook(() => useQuests());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  await unmount();
  await act(async () => { fail(new Error("通信失敗")); });
  await act(async () => { jest.advanceTimersByTime(120_000); });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
