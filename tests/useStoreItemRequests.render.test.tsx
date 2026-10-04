import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { StoreItemRequest } from "../types";

// Issue #308: 親用ストアの申請タブを開いたまま他タブへ移動して戻っても、
// 子が新しく出した商品追加申請が反映されなかった。フォーカス復帰で再取得されることを確かめる。

let mockFocusCallback: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      mockFocusCallback = effect;
      effect();
    }, [effect]);
  },
}));

const mockFetchStoreItemRequests = jest.fn<(familyId: string) => Promise<StoreItemRequest[]>>();
jest.mock("../lib/storeItemRequestService", () => ({
  fetchStoreItemRequests: (familyId: string) => mockFetchStoreItemRequests(familyId),
}));

import { useStoreItemRequests } from "../lib/useStoreItemRequests";

const parent = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "10000000-0000-4000-8000-000000000308",
  id: "11111111-1111-1111-1111-111111111111",
  name: "お父さん",
  role: "parent" as const,
};

const otherParent = {
  ...parent,
  family_id: "20000000-0000-4000-8000-000000000308",
  id: "22222222-2222-2222-2222-222222222222",
  name: "別の家のお母さん",
};

const requestA = { id: "request-a", status: "pending", title: "ゲーム30分" } as StoreItemRequest;
const requestB = { id: "request-b", status: "pending", title: "おやつ" } as StoreItemRequest;

beforeEach(() => {
  jest.clearAllMocks();
  // 前のテストで使われずに残った mockResolvedValueOnce を持ち越さないよう、実装ごと戻す
  mockFetchStoreItemRequests.mockReset();
  mockFocusCallback = undefined;
  useAppStore.setState({ user: parent });
});

test("フォーカスが戻るたびに申請一覧を再取得し、その間に出された申請を表示する", async () => {
  mockFetchStoreItemRequests.mockResolvedValueOnce([requestA]);

  const { result } = renderHook(() => useStoreItemRequests());

  await waitFor(() => expect(result.current.requests).toEqual([requestA]));
  expect(mockFetchStoreItemRequests).toHaveBeenCalledTimes(1);
  expect(mockFetchStoreItemRequests).toHaveBeenCalledWith(parent.family_id);

  // 申請タブを開いたまま他タブへ移動している間に、子が新しい申請を出した
  mockFetchStoreItemRequests.mockResolvedValueOnce([requestA, requestB]);

  await act(async () => {
    mockFocusCallback?.();
  });

  await waitFor(() => expect(result.current.requests).toEqual([requestA, requestB]));
  expect(mockFetchStoreItemRequests).toHaveBeenCalledTimes(2);
});

test("フォーカス復帰の再取得中は、前回の一覧を表示し続ける（一瞬空になるちらつきを防ぐ）", async () => {
  mockFetchStoreItemRequests.mockResolvedValueOnce([requestA]);

  const { result } = renderHook(() => useStoreItemRequests());

  await waitFor(() => expect(result.current.requests).toEqual([requestA]));

  let resolveSecond!: (value: StoreItemRequest[]) => void;
  mockFetchStoreItemRequests.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  );

  await act(async () => {
    mockFocusCallback?.();
  });

  expect(result.current.loading).toBe(true);
  expect(result.current.requests).toEqual([requestA]);

  await act(async () => {
    resolveSecond([requestA, requestB]);
  });

  await waitFor(() => expect(result.current.requests).toEqual([requestA, requestB]));
  expect(result.current.loading).toBe(false);
});

test("利用者が切り替わったときは、取得完了を待たずに前の利用者の申請を消す", async () => {
  mockFetchStoreItemRequests.mockResolvedValueOnce([requestA]);

  const { result } = renderHook(() => useStoreItemRequests());

  await waitFor(() => expect(result.current.requests).toEqual([requestA]));

  mockFetchStoreItemRequests.mockReturnValueOnce(new Promise(() => {}));

  await act(async () => {
    useAppStore.setState({ user: otherParent });
  });

  await waitFor(() => expect(mockFetchStoreItemRequests).toHaveBeenLastCalledWith(otherParent.family_id));
  expect(result.current.requests).toEqual([]);
  expect(result.current.loading).toBe(true);
});
