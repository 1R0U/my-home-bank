import { act, renderHook, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

// Issue #506: 家具の配置を取得できなかったときに動かしても、アプリの配置と3Dシーンがずれないこと。
// ずれると、次に持ち上げたときに元の場所から動かしたことになり、元の場所へ飛んで戻って見えた。

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../store", () => ({
  useCurrentUser: () => ({ id: "user-506" }),
  useDataAccess: () => ({ canUseRealData: true }),
}));

const mockFetch = jest.fn<(userId: string) => Promise<unknown[]>>();
const mockSave = jest.fn<(userId: string, layout: unknown) => Promise<void>>();
const mockStore = jest.fn<(furnitureId: string) => Promise<void>>();
jest.mock("../lib/houseFurnitureService", () => ({
  fetchHouseFurnitureLayouts: (userId: string) => mockFetch(userId),
  saveHouseFurnitureLayout: (userId: string, layout: unknown) => mockSave(userId, layout),
  storeHouseFurniture: (furnitureId: string) => mockStore(furnitureId),
}));

import { clearResourceCache } from "../lib/resourceCache";
import { useHouseFurnitureLayouts } from "../lib/useHouseFurnitureLayouts";
import { useMapStore } from "../store/mapStore";

const MOVED = { furnitureId: "house-closet", rotationY: 0, x: -3.3, z: -77.75 };

beforeEach(() => {
  jest.clearAllMocks();
  useMapStore.getState().setFurnitureLayouts([]);
  mockSave.mockResolvedValue(undefined);
  mockStore.mockResolvedValue(undefined);
});

afterEach(() => {
  clearResourceCache();
});

/** 取得に失敗した状態でフックを動かす */
async function renderWithFailedFetch() {
  mockFetch.mockRejectedValue(new Error("column house_furniture_layouts.stored does not exist"));
  const hook = await renderHook(() => useHouseFurnitureLayouts());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  return hook;
}

test("取得できなかったときに動かしても、マップの配置は動かした位置になる", async () => {
  const { result } = await renderWithFailedFetch();

  await act(() => result.current.save(MOVED));

  expect(mockSave).toHaveBeenCalledWith("user-506", MOVED);
  expect(useMapStore.getState().furnitureLayouts).toEqual([{ ...MOVED, stored: false }]);
  const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
  expect(closet?.position.z).toBeCloseTo(MOVED.z);
});

test("取得できなかったときにしまっても、マップから消える", async () => {
  const { result } = await renderWithFailedFetch();

  await act(() => result.current.store("house-sofa"));

  expect(mockStore).toHaveBeenCalledWith("house-sofa");
  expect(useMapStore.getState().objects.some((object) => object.id === "house-sofa")).toBe(false);
});

test("取得できず、保存にも失敗したら、動かす前の配置へ戻す", async () => {
  const { result } = await renderWithFailedFetch();
  mockSave.mockRejectedValue(new Error("denied"));

  await act(async () => {
    await expect(result.current.save(MOVED)).rejects.toThrow("denied");
  });

  expect(useMapStore.getState().furnitureLayouts).toEqual([]);
});

test("取得できているときは、取得結果を書き換えてマップへ反映する（今までどおり）", async () => {
  mockFetch.mockResolvedValue([]);
  const { result } = await renderHook(() => useHouseFurnitureLayouts());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());

  await act(() => result.current.save(MOVED));

  expect(useMapStore.getState().furnitureLayouts).toEqual([{ ...MOVED, stored: false }]);
});
