import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchOwnedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchEquippedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSaveEquippedItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/wardrobeService", () => ({
  fetchEquippedItems: (...args: unknown[]) => mockFetchEquippedItems(...args),
  fetchOwnedItems: (...args: unknown[]) => mockFetchOwnedItems(...args),
  saveEquippedItem: (...args: unknown[]) => mockSaveEquippedItem(...args),
}));

import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { DEFAULT_PLAYER_EQUIPMENT } from "../lib/rpg-hub/equipment";
import { useWardrobe } from "../lib/useWardrobe";
import { useAppStore } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;

const user = (id: string) => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name: "たろう",
  role: "child" as const,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useWardrobeStore.setState({ equipment: {}, ownedAssetIds: [] });
  mockFetchOwnedItems.mockResolvedValue([]);
  mockFetchEquippedItems.mockResolvedValue([]);
  mockSaveEquippedItem.mockResolvedValue(undefined);
});

test("読み込んだ所有と装備が反映される", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }, { asset_id: GLASSES }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  renderHook(() => useWardrobe());
  await act(async () => undefined);

  const state = useWardrobeStore.getState();
  expect(state.ownedAssetIds).toHaveLength(2);
  expect(state.equipment).toEqual({ head: HAT });
});

test("モックアカウントでは既定の装備を着せ、実APIを呼ばない", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）。
  // 何も着ていないカエルを出すより、他の画面と同じモックの見え方にそろえる
  useAppStore.setState({ user: user("user-child-1") });

  renderHook(() => useWardrobe());

  expect(mockFetchOwnedItems).not.toHaveBeenCalled();
  expect(useWardrobeStore.getState().equipment).toEqual(DEFAULT_PLAYER_EQUIPMENT);
  // 買えないし脱げないので、選ばせるものは出さない
  expect(useWardrobeStore.getState().ownedAssetIds).toEqual([]);
});

test("未ログインなら実APIを呼ばない", () => {
  renderHook(() => useWardrobe());

  expect(mockFetchOwnedItems).not.toHaveBeenCalled();
  expect(mockFetchEquippedItems).not.toHaveBeenCalled();
});

test("ユーザーが変わったら、取得を待たずに前の人の装備を消す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { rerender } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  expect(useWardrobeStore.getState().equipment).toEqual({ head: HAT });

  // 次の人の取得は終わらせない。切り替え直後に前の人の帽子が見えないこと（#147 と同じ形）
  let resolveOwned: (value: unknown) => void = () => undefined;
  mockFetchOwnedItems.mockReturnValue(new Promise((resolve) => (resolveOwned = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  expect(useWardrobeStore.getState().equipment).toEqual({});
  resolveOwned([]);
});

test("取得に失敗したら何も着ていない状態にする", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockRejectedValue(new Error("network"));

  renderHook(() => useWardrobe());
  await act(async () => undefined);

  expect(useWardrobeStore.getState().equipment).toEqual({});
});

test("着け替えると保存してから読み直す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);
  await act(async () => {
    await result.current.equip("head", HAT);
  });

  expect(mockSaveEquippedItem).toHaveBeenCalledWith(USER_A, "head", HAT);
  expect(useWardrobeStore.getState().equipment).toEqual({ head: HAT });
});

test("同じ内容を読み直しても参照が変わらない", async () => {
  // 変わると画面の effect が再実行され、WebView へ同じ装備を送り直して帽子を作り直す
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  const before = useWardrobeStore.getState();

  await act(async () => {
    await result.current.reload();
  });
  const after = useWardrobeStore.getState();

  expect(after.equipment).toBe(before.equipment);
  expect(after.ownedAssetIds).toBe(before.ownedAssetIds);
});
