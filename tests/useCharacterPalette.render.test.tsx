import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchCharacterPalette = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSavePaletteColor = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: (...args: unknown[]) => mockFetchCharacterPalette(...args),
  savePaletteColor: (...args: unknown[]) => mockSavePaletteColor(...args),
}));

import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

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
  useAppearanceStore.setState({ palette: {} });
  mockFetchCharacterPalette.mockResolvedValue({});
  mockSavePaletteColor.mockResolvedValue(undefined);
});

test("読み込んだ色が反映される", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({ accent: "#2f7a2a", skin: "#4fae3f" });

  renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({ accent: "#2f7a2a", skin: "#4fae3f" });
});

test("モックアカウントでは既定（空）のままにし、実APIを呼ばない", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）
  useAppStore.setState({ user: user("user-child-1") });

  renderHook(() => useCharacterPalette());

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  expect(useAppearanceStore.getState().palette).toEqual({});
});

test("未ログインなら実APIを呼ばない", () => {
  renderHook(() => useCharacterPalette());

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
});

test("ユーザーが変わったら、取得を待たずに前の人の色を消す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });

  const { rerender } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });

  // 次の人の取得は終わらせない。切り替え直後に前の人の色が見えないこと（#147と同じ形）
  let resolveNext: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  expect(useAppearanceStore.getState().palette).toEqual({});
  resolveNext({});
});

test("同じ利用者のまま別のフックインスタンスがマウントされても、色を消さない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });

  renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });

  // RpgHubScreenと色を選ぶ画面の両方がこのフックを呼ぶため、同じ利用者のまま
  // 新しいフックインスタンスがマウントされることがある（lib/useWardrobe.ts にある
  // 同種のバグは踏まない）
  mockFetchCharacterPalette.mockClear();
  renderHook(() => useCharacterPalette());

  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
});

test("取得に失敗したら既定（空）へ戻す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockRejectedValue(new Error("network"));

  renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({});
});

test("selectは保存してから取り直す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({});

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => {
    await result.current.select("skin", "#4fae3f");
  });

  expect(mockSavePaletteColor).toHaveBeenCalledWith(USER_A, "skin", "#4fae3f");
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });
});

test("selectは保存中に別のユーザーへ切り替わっていたら読み直さない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({});

  const { result, rerender } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  let resolveSave: () => void = () => undefined;
  mockSavePaletteColor.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));

  const selectPromise = result.current.select("skin", "#4fae3f");

  // 保存が終わる前にユーザーが切り替わる
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);
  mockFetchCharacterPalette.mockClear();

  resolveSave();
  await act(async () => {
    await selectPromise;
  });

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
});
