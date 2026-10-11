import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";

// Issue #354: 大人ホームのベルのバッジ用に、未読のお知らせの件数だけを取るフック

let mockFocusCallback: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      mockFocusCallback = effect;
      effect();
    }, [effect]);
  },
}));

const mockFetchNotifications = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchUnreadNotificationCount = jest.fn<(userId: string) => Promise<number>>();
jest.mock("../lib/notificationService", () => ({
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  fetchUnreadNotificationCount: (userId: string) => mockFetchUnreadNotificationCount(userId),
}));

import { useUnreadNotificationCount } from "../lib/useUnreadNotificationCount";
import { REFETCH_MIN_INTERVAL_MS } from "../lib/useRefetchOnFocus";

// お知らせは他の端末やサーバーから届くので、フォーカス時の再取得が省かれる時間
// （Issue #243）を過ぎてから戻った状況にする。時刻はテストから進める。
let mockNow = 1_000_000;
jest.spyOn(Date, "now").mockImplementation(() => mockNow);

/** 他のタブで過ごした時間ぶん、時計を進める。 */
function spendTimeOnOtherTab() {
  mockNow += REFETCH_MIN_INTERVAL_MS;
}

const parent = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
  id: "11111111-1111-1111-1111-111111111111",
  name: "お父さん",
  role: "parent" as const,
};

const otherParent = { ...parent, id: "22222222-2222-2222-2222-222222222222", name: "お母さん" };

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchUnreadNotificationCount.mockReset();
  mockFocusCallback = undefined;
  useAppStore.setState({ user: parent });
});

test("自分あての未読の件数を取り、お知らせの一覧は取らない", async () => {
  mockFetchUnreadNotificationCount.mockResolvedValue(3);

  const { result } = renderHook(() => useUnreadNotificationCount());

  await waitFor(() => expect(result.current).toBe(3));
  expect(mockFetchUnreadNotificationCount).toHaveBeenCalledWith(parent.id);
  expect(mockFetchNotifications).not.toHaveBeenCalled();
});

test("フォーカスが戻るたびに取り直す", async () => {
  mockFetchUnreadNotificationCount.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

  const { result } = renderHook(() => useUnreadNotificationCount());
  await waitFor(() => expect(result.current).toBe(1));

  await act(async () => {
    spendTimeOnOtherTab();
    mockFocusCallback?.();
  });

  await waitFor(() => expect(result.current).toBe(4));
  expect(mockFetchUnreadNotificationCount).toHaveBeenCalledTimes(2);
});

test("先に始めた取得が後から終わっても、新しい件数を上書きしない", async () => {
  let resolveFirst: (count: number) => void = () => undefined;
  mockFetchUnreadNotificationCount
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(5);

  const { result } = renderHook(() => useUnreadNotificationCount());

  await act(async () => {
    spendTimeOnOtherTab();
    mockFocusCallback?.();
  });
  await waitFor(() => expect(result.current).toBe(5));

  await act(async () => {
    resolveFirst(9);
  });

  expect(result.current).toBe(5);
});

test("利用者が切り替わったら、取り終わるまで前の利用者の件数を出さない", async () => {
  mockFetchUnreadNotificationCount.mockResolvedValueOnce(3);
  const { result } = renderHook(() => useUnreadNotificationCount());
  await waitFor(() => expect(result.current).toBe(3));

  let resolveOther: (count: number) => void = () => undefined;
  mockFetchUnreadNotificationCount.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOther = resolve;
      }),
  );
  await act(async () => {
    useAppStore.setState({ user: otherParent });
  });

  expect(result.current).toBe(0);
  expect(mockFetchUnreadNotificationCount).toHaveBeenLastCalledWith(otherParent.id);

  await act(async () => {
    resolveOther(7);
  });
  expect(result.current).toBe(7);
});

test("取得に失敗したときは0にする（バッジを出さないだけで、ホームは使える）", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchUnreadNotificationCount.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error("network"));

  const { result } = renderHook(() => useUnreadNotificationCount());
  await waitFor(() => expect(result.current).toBe(2));

  await act(async () => {
    spendTimeOnOtherTab();
    mockFocusCallback?.();
  });

  await waitFor(() => expect(result.current).toBe(0));
  warnSpy.mockRestore();
});

test("モックの利用者（プレビュー）では取得せず0のまま", async () => {
  useAppStore.setState({ user: { ...parent, id: "user-parent-1" } });

  const { result } = renderHook(() => useUnreadNotificationCount());
  await act(async () => undefined);

  expect(result.current).toBe(0);
  expect(mockFetchUnreadNotificationCount).not.toHaveBeenCalled();
});
