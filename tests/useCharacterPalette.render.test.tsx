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
  useAppearanceStore.setState({ palette: {}, paletteLoadedFor: null });
  mockFetchCharacterPalette.mockResolvedValue({});
  mockSavePaletteColor.mockResolvedValue(undefined);
});

test("読み込んだ色が反映され、isReadyがtrueになる", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({ accent: "#2f7a2a", skin: "#4fae3f" });

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({ accent: "#2f7a2a", skin: "#4fae3f" });
  expect(result.current.isReady).toBe(true);
});

test("モックアカウントでは既定（空）のままにし、実APIを呼ばずに即isReadyになる", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）
  useAppStore.setState({ user: user("user-child-1") });

  const { result } = renderHook(() => useCharacterPalette());

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  expect(useAppearanceStore.getState().palette).toEqual({});
  expect(result.current.isReady).toBe(true);
});

test("未ログインなら実APIを呼ばず、即isReadyになる", () => {
  const { result } = renderHook(() => useCharacterPalette());

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  expect(result.current.isReady).toBe(true);
});

test("ユーザーが変わったら、次の取得が終わるまでisReadyがfalseになる（前の人の色を出さない）", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });

  const { result, rerender } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
  expect(result.current.isReady).toBe(true);

  // 次の人の取得は終わらせない。呼び出し側はisReadyがfalseの間、palette
  // （前の人の"#f2a1c2"のまま）を使わないので前の人の色は見えない（#147と同じ考え方）
  let resolveNext: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  expect(result.current.isReady).toBe(false);

  await act(async () => {
    resolveNext({});
    await Promise.resolve();
  });
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().palette).toEqual({});
});

test("前の利用者の色がストアに残った状態で新規マウントしても、その人の取得が終わるまでisReadyがfalseになる", async () => {
  // 前の利用者の画面が既に無い状態で、新しい利用者の画面が最初から開く場合を再現する
  // （PR #296レビュー対応。前のuseEffectベースの実装では、このケースで消すべき色を
  // 検知できなかった）
  useAppearanceStore.setState({ palette: { skin: "#f2a1c2" }, paletteLoadedFor: USER_A });
  useAppStore.setState({ user: user(USER_B) });

  let resolveFetch: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));

  const { result } = renderHook(() => useCharacterPalette());

  expect(result.current.isReady).toBe(false);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });

  await act(async () => {
    resolveFetch({});
    await Promise.resolve();
  });
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().palette).toEqual({});
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

test("取得に失敗したら既定（空）へ戻し、isReadyはtrueになる", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterPalette.mockRejectedValue(new Error("network"));

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({});
  expect(result.current.isReady).toBe(true);
});

test("別インスタンスの古い取得結果は、保存後の色を上書きしない（世代を共有するため）", async () => {
  // RpgHubScreenと色を選ぶ画面、両方がこのフックを呼んでいる状況を再現する
  useAppStore.setState({ user: user(USER_A) });

  let resolveSlowFetch: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveSlowFetch = resolve)));

  // インスタンス1（RpgHubScreen役）。取得はまだ終わらせない
  renderHook(() => useCharacterPalette());
  // インスタンス2（色を選ぶ画面役）。マウント時の取得も終わらせない
  const { result: instance2 } = renderHook(() => useCharacterPalette());

  // インスタンス2で保存する。保存後の再取得は新しい色を返す
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => {
    await instance2.current.select("skin", "#4fae3f");
  });
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });

  // ここでインスタンス1の古い取得が完了する。世代を共有しているため、
  // 保存で更新済みの色を古い結果で上書きしない
  await act(async () => {
    resolveSlowFetch({});
    await Promise.resolve();
  });
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });
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
