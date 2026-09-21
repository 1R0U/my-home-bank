import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchUserFamilyId = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockFetchFamilyMembers = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/userService", () => ({
  fetchFamilyMembers: (...args: unknown[]) => mockFetchFamilyMembers(...args),
  fetchUserFamilyId: (...args: unknown[]) => mockFetchUserFamilyId(...args),
}));

import { MOCK_USERS } from "../constants/mockData";
import { useFamilyHouses } from "../lib/useFamilyHouses";
import { INITIAL_MAP_OBJECTS, MAX_FAMILY_HOUSES } from "../lib/rpg-hub/mapObjects";
import { useAppStore } from "../store";
import { useMapStore } from "../store/mapStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const FAMILY_ID = "33333333-3333-3333-3333-333333333333";

const user = (id: string, name = "たろう") => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name,
  role: "child" as const,
});

/** いま建っている家の表札。 */
const houseNames = () =>
  useMapStore.getState().familyHouses.map((house) => (house as { name: string }).name);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useMapStore.setState({ familyHouses: [], objects: INITIAL_MAP_OBJECTS, placedDecorations: [] });
  mockFetchUserFamilyId.mockResolvedValue(FAMILY_ID);
  mockFetchFamilyMembers.mockResolvedValue([
    { id: "db-1", name: "おかあさん", role: "parent" },
    { id: "db-2", name: "けんた", role: "child" },
  ]);
});

test("家族の人数ぶんの家が、町の固定物のうしろに足される", async () => {
  useAppStore.setState({ user: user(USER_A) });

  renderHook(() => useFamilyHouses());
  await act(async () => undefined);

  expect(mockFetchUserFamilyId).toHaveBeenCalledWith(USER_A);
  expect(mockFetchFamilyMembers).toHaveBeenCalledWith(FAMILY_ID);
  expect(houseNames()).toEqual(["おかあさんの家", "けんたの家"]);

  const state = useMapStore.getState();
  expect(state.objects).toHaveLength(INITIAL_MAP_OBJECTS.length + 2);
  expect(state.objects.slice(0, INITIAL_MAP_OBJECTS.length)).toEqual(INITIAL_MAP_OBJECTS);
});

test("未ログインなら実APIを呼ばず、モックの家族の家を建てる", () => {
  // 家が1軒も無いと、着せ替え（姿見）と家の中の「かざる」への入口ごと消える
  renderHook(() => useFamilyHouses());

  expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
  expect(houseNames()).toEqual(MOCK_USERS.map((mockUser) => `${mockUser.name}の家`));
});

test("非UUIDのモックIDでは実APIを呼ばず、その人の家も建てる", () => {
  useAppStore.setState({ user: user("user-child-1", "ログイン中の子") });

  renderHook(() => useFamilyHouses());

  expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
  expect(houseNames()[0]).toBe("ログイン中の子の家");
});

test("家族が未設定でも、住宅街は空にしない", async () => {
  useAppStore.setState({ user: user(USER_A, "ゲストの子") });
  mockFetchUserFamilyId.mockResolvedValue(null);

  renderHook(() => useFamilyHouses());
  await act(async () => undefined);

  expect(mockFetchFamilyMembers).not.toHaveBeenCalled();
  expect(houseNames()[0]).toBe("ゲストの子の家");
});

test("家族の取得に失敗しても、住宅街は空にしない", async () => {
  useAppStore.setState({ user: user(USER_A, "ゲストの子") });
  mockFetchFamilyMembers.mockRejectedValue(new Error("boom"));

  renderHook(() => useFamilyHouses());
  await act(async () => undefined);

  expect(houseNames()[0]).toBe("ゲストの子の家");
});

test("家族が1件も見えないときも、住宅街は空にしない", async () => {
  // RLSで0件になるケース（ギルド金庫と同じ事情）。空配列で家を消してしまわない
  useAppStore.setState({ user: user(USER_A, "ゲストの子") });
  mockFetchFamilyMembers.mockResolvedValue([]);

  renderHook(() => useFamilyHouses());
  await act(async () => undefined);

  expect(houseNames()[0]).toBe("ゲストの子の家");
});

test("区画の数を超える家族でも、建つのは上限までにとどまる", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchFamilyMembers.mockResolvedValue(
    Array.from({ length: MAX_FAMILY_HOUSES + 2 }, (_, index) => ({
      id: `db-${index}`,
      name: `かぞく${index}`,
      role: "child",
    })),
  );

  renderHook(() => useFamilyHouses());
  await act(async () => undefined);

  expect(houseNames()).toHaveLength(MAX_FAMILY_HOUSES);
});

test("同じ家族を取り直しても、マップを作り直さない", async () => {
  // 作り直すと画面が setMap を送り直し、WebView がメッシュを組み直す（住人の位置も戻る）
  useAppStore.setState({ user: user(USER_A) });

  const { result } = renderHook(() => useFamilyHouses());
  await act(async () => undefined);
  const objects = useMapStore.getState().objects;

  await act(async () => {
    await result.current.reload();
  });

  expect(useMapStore.getState().objects).toBe(objects);
});
