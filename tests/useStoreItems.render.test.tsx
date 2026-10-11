import { act, renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { PricedStoreItem, StoreItem } from "../types";

const mockFetchStoreCatalog = jest.fn<(...args: unknown[]) => Promise<{ items: PricedStoreItem[]; priceIndex: 95 | 100 | 105 | 110 }>>();
const mockFetchStoreItems = jest.fn<(...args: unknown[]) => Promise<StoreItem[]>>();
jest.mock("../lib/storeService", () => ({
  fetchStoreCatalog: (...args: unknown[]) => mockFetchStoreCatalog(...args),
  fetchStoreItems: (...args: unknown[]) => mockFetchStoreItems(...args),
}));

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

import { useStoreItems } from "../lib/useStoreItems";

const itemA = { id: "item-a" } as PricedStoreItem;
const itemB = { id: "item-b" } as PricedStoreItem;

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

test("親向けの既定取得は物価指数RPCを使わず、非公開商品を含む一覧を直接取得する", async () => {
  const inactiveItem = { id: "inactive-item", is_active: false } as StoreItem;
  mockFetchStoreItems.mockResolvedValueOnce([inactiveItem]);

  const { result } = renderHook(() => useStoreItems());

  await waitFor(() => expect(result.current.items).toEqual([inactiveItem]));
  expect(mockFetchStoreItems).toHaveBeenCalledWith(uuidUser.family_id);
  expect(mockFetchStoreCatalog).not.toHaveBeenCalled();
});

test("ライブ接続中に reload しても、取得完了までは前回の一覧を表示し続ける", async () => {
  mockFetchStoreCatalog.mockResolvedValueOnce({ items: [itemA], priceIndex: 95 });

  const { result } = renderHook(() => useStoreItems({ indexed: true }));

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
  expect(result.current.loading).toBe(false);

  let resolveSecond!: (value: { items: PricedStoreItem[]; priceIndex: 95 | 100 | 105 | 110 }) => void;
  mockFetchStoreCatalog.mockReturnValueOnce(
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
    resolveSecond({ items: [itemA, itemB], priceIndex: 105 });
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.items).toEqual([itemA, itemB]));
  expect(result.current.priceIndex).toBe(105);
});

test("非ライブ→ライブに切り替わった直後は一覧をクリアしてから取得する", async () => {
  useAppStore.setState({ user: null });
  let resolveFetch!: (value: { items: PricedStoreItem[]; priceIndex: 95 | 100 | 105 | 110 }) => void;
  mockFetchStoreCatalog.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );

  const { result, rerender } = renderHook(() => useStoreItems({ indexed: true }));
  const mockItemsBeforeLogin = result.current.items;
  expect(mockItemsBeforeLogin.length).toBeGreaterThan(0); // モックデータが入っている

  useAppStore.setState({ user: uuidUser });
  rerender({});

  await waitFor(() => expect(result.current.items).toEqual([]));

  await act(async () => {
    resolveFetch({ items: [itemA], priceIndex: 100 });
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
});

test("非UUIDのモックIDでも家庭IDがあれば、DB側の家庭スコープで商品を取得する", async () => {
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
  mockFetchStoreCatalog.mockResolvedValueOnce({ items: [itemA], priceIndex: 100 });

  const { result } = renderHook(() => useStoreItems({ indexed: true }));

  await waitFor(() => expect(result.current.isLive).toBe(true));
  await waitFor(() => expect(mockFetchStoreCatalog).toHaveBeenCalledTimes(1));
  expect(mockFetchStoreCatalog).toHaveBeenCalledWith();
  await waitFor(() => expect(result.current.items).toEqual([itemA]));
});

test("マウントしたままログイン中の利用者が切り替わったら、商品一覧を再取得する（#149）", async () => {
  mockFetchStoreCatalog.mockResolvedValueOnce({ items: [itemA], priceIndex: 100 });

  const { result } = renderHook(() => useStoreItems({ indexed: true }));

  await waitFor(() => expect(result.current.items).toEqual([itemA]));
  expect(mockFetchStoreCatalog).toHaveBeenCalledTimes(1);

  mockFetchStoreCatalog.mockResolvedValueOnce({ items: [itemB], priceIndex: 110 });
  act(() => {
    useAppStore.setState({
      user: { ...uuidUser, id: "22222222-2222-2222-2222-222222222222", name: "はなこ" },
    });
  });

  await waitFor(() => expect(result.current.items).toEqual([itemB]));
  expect(mockFetchStoreCatalog).toHaveBeenCalledTimes(2);
});
