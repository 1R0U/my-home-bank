import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { StoreItem } from "../types";

const mockFetchStoreItems = jest.fn<(...args: unknown[]) => Promise<StoreItem[]>>();
jest.mock("../lib/storeService", () => ({
  fetchStoreItems: (...args: unknown[]) => mockFetchStoreItems(...args),
}));

let mockCurrentUser: { id: string } | null = null;
jest.mock("../store", () => ({
  useCurrentUser: () => mockCurrentUser,
}));

import { useStoreItems } from "../lib/useStoreItems";

const itemA = { id: "item-a" } as StoreItem;
const itemB = { id: "item-b" } as StoreItem;

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { id: "user-1" };
});

test("ライブ接続中に reload しても、取得完了までは前回の一覧を表示し続ける", async () => {
  mockFetchStoreItems.mockResolvedValueOnce([itemA]);

  const { result } = renderHook(() => useStoreItems());

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
  expect(result.current.loading).toBe(false);

  let resolveSecond!: (value: StoreItem[]) => void;
  mockFetchStoreItems.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  );

  act(() => {
    result.current.reload();
  });

  // 取得中（2回目以降）は一覧をクリアせず、前回の結果を表示し続ける
  expect(result.current.loading).toBe(true);
  expect(result.current.items).toEqual([itemA]);

  await act(async () => {
    resolveSecond([itemA, itemB]);
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.items).toEqual([itemA, itemB]));
});

test("ログアウトを挟まないユーザー切替でも再取得される", async () => {
  mockFetchStoreItems.mockResolvedValue([itemA]);

  const { rerender } = renderHook(() => useStoreItems());

  await waitFor(() => expect(mockFetchStoreItems).toHaveBeenCalledTimes(1));

  mockCurrentUser = { id: "user-2" };
  rerender({});

  await waitFor(() => expect(mockFetchStoreItems).toHaveBeenCalledTimes(2));
});

test("非ライブ→ライブに切り替わった直後は一覧をクリアしてから取得する", async () => {
  mockCurrentUser = null;
  let resolveFetch!: (value: StoreItem[]) => void;
  mockFetchStoreItems.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );

  const { result, rerender } = renderHook(() => useStoreItems());
  const mockItemsBeforeLogin = result.current.items;
  expect(mockItemsBeforeLogin.length).toBeGreaterThan(0); // モックデータが入っている

  mockCurrentUser = { id: "user-1" };
  rerender({});

  await waitFor(() => expect(result.current.items).toEqual([]));

  await act(async () => {
    resolveFetch([itemA]);
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
});
