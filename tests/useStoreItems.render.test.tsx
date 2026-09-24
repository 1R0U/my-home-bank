import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { StoreItem } from "../types";

const mockFetchStoreItems = jest.fn<(...args: unknown[]) => Promise<StoreItem[]>>();
jest.mock("../lib/storeService", () => ({
  fetchStoreItems: (...args: unknown[]) => mockFetchStoreItems(...args),
}));

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

import { useStoreItems } from "../lib/useStoreItems";

const itemA = { id: "item-a" } as StoreItem;
const itemB = { id: "item-b" } as StoreItem;

const uuidUser = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "10000000-0000-4000-8000-000000000208",
  id: "11111111-1111-1111-1111-111111111111",
  name: "たろう",
  role: "child" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: uuidUser });
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

test("非ライブ→ライブに切り替わった直後は一覧をクリアしてから取得する", async () => {
  useAppStore.setState({ user: null });
  let resolveFetch!: (value: StoreItem[]) => void;
  mockFetchStoreItems.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );

  const { result, rerender } = renderHook(() => useStoreItems());
  const mockItemsBeforeLogin = result.current.items;
  expect(mockItemsBeforeLogin.length).toBeGreaterThan(0); // モックデータが入っている

  useAppStore.setState({ user: uuidUser });
  rerender({});

  await waitFor(() => expect(result.current.items).toEqual([]));

  await act(async () => {
    resolveFetch([itemA]);
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
});

test("非UUIDのモックIDでも家庭IDがあれば、その家庭の商品を取得する", async () => {
  useAppStore.setState({
    user: {
      balance: 320,
      created_at: "2026-07-01T00:00:00Z",
      family_id: "10000000-0000-4000-8000-000000000208",
      id: "user-child-1",
      name: "たろう",
      role: "child",
    },
  });
  mockFetchStoreItems.mockResolvedValueOnce([itemA]);

  const { result } = renderHook(() => useStoreItems());

  await waitFor(() => expect(result.current.isLive).toBe(true));
  await waitFor(() => expect(mockFetchStoreItems).toHaveBeenCalledTimes(1));
  expect(mockFetchStoreItems).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000208");
  await waitFor(() => expect(result.current.items).toEqual([itemA]));
});

test("マウントしたままログイン中の利用者が切り替わったら、商品一覧を再取得する（#149）", async () => {
  mockFetchStoreItems.mockResolvedValueOnce([itemA]);

  const { result } = renderHook(() => useStoreItems());

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
  expect(mockFetchStoreItems).toHaveBeenCalledTimes(1);

  mockFetchStoreItems.mockResolvedValueOnce([itemB]);
  act(() => {
    useAppStore.setState({
      user: { ...uuidUser, id: "22222222-2222-2222-2222-222222222222", name: "はなこ" },
    });
  });

  await waitFor(() => expect(result.current.items).toEqual([itemB]));
  expect(mockFetchStoreItems).toHaveBeenCalledTimes(2);
});
