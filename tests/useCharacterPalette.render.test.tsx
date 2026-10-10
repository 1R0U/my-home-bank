import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchCharacterPalette = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSavePaletteChanges = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: (...args: unknown[]) => mockFetchCharacterPalette(...args),
  savePaletteChanges: (...args: unknown[]) => mockSavePaletteChanges(...args),
}));

import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import type { CharacterType } from "../lib/rpg-hub/characterTypes";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const user = (id: string) => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name: "たろう",
  role: "child" as const,
});

function setUser(id: string, characterType: CharacterType = "frog") {
  act(() => {
    useAppStore.setState({ user: user(id) });
    useAppearanceStore.setState({ characterType, characterTypeLoadedFor: id });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useAppearanceStore.setState({
    characterType: "frog", characterTypeLoadedFor: null,
    palette: {}, paletteLoadedFor: null, paletteLoadedCharacterType: "frog",
  });
  mockFetchCharacterPalette.mockResolvedValue({});
  mockSavePaletteChanges.mockResolvedValue(undefined);
});

test("読み込んだ色が反映され、isReadyがtrueになる", async () => {
  setUser(USER_A);
  mockFetchCharacterPalette.mockResolvedValue({ accent: "#2f7a2a", skin: "#4fae3f" });

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({ accent: "#2f7a2a", skin: "#4fae3f" });
  expect(result.current.isReady).toBe(true);
  expect(mockFetchCharacterPalette).toHaveBeenCalledWith(USER_A, "frog");
});

test("モックアカウントでは既定（空）のままにし、実APIを呼ばずに即isReadyになる", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）
  setUser("user-child-1");

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
  setUser(USER_A);
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });

  const { result, rerender } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
  expect(result.current.isReady).toBe(true);

  // 次の人の取得は終わらせない。呼び出し側はisReadyがfalseの間、palette
  // （前の人の"#f2a1c2"のまま）を使わないので前の人の色は見えない（#147と同じ考え方）
  let resolveNext: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
  setUser(USER_B);
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
  setUser(USER_B);

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
  setUser(USER_A);
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
  setUser(USER_A);
  mockFetchCharacterPalette.mockRejectedValue(new Error("network"));

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().palette).toEqual({});
  expect(result.current.isReady).toBe(true);
});

test("別インスタンスの古い取得結果は、保存後の色を上書きしない（世代を共有するため）", async () => {
  // RpgHubScreenと更衣室、両方がこのフックを呼んでいる状況を再現する
  setUser(USER_A);

  let resolveSlowFetch: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveSlowFetch = resolve)));

  // インスタンス1（RpgHubScreen役）。取得はまだ終わらせない
  renderHook(() => useCharacterPalette());
  // インスタンス2（更衣室役）。マウント時の取得も終わらせない
  const { result: instance2 } = renderHook(() => useCharacterPalette());

  // インスタンス2で保存する。保存後の再取得は新しい色を返す
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => {
    await instance2.current.save([{ color: "#4fae3f", slot: "skin" }]);
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

test("saveは保存してから取り直す", async () => {
  setUser(USER_A);
  mockFetchCharacterPalette.mockResolvedValue({});

  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => {
    await result.current.save([{ color: "#4fae3f", slot: "skin" }]);
  });

  expect(mockSavePaletteChanges).toHaveBeenCalledWith(USER_A, "frog", [{ color: "#4fae3f", slot: "skin" }]);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });
});

test("saveは保存中に別のユーザーへ切り替わっていたら読み直さない", async () => {
  setUser(USER_A);
  mockFetchCharacterPalette.mockResolvedValue({});

  const { result, rerender } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  let resolveSave: () => void = () => undefined;
  mockSavePaletteChanges.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));

  const savePromise = result.current.save([{ color: "#4fae3f", slot: "skin" }]);

  // 保存が終わる前にユーザーが切り替わる
  setUser(USER_B);
  rerender(undefined);
  mockFetchCharacterPalette.mockClear();

  resolveSave();
  await act(async () => {
    await savePromise;
  });

  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
});

test("saveは変更が無ければ保存も取り直しもしない", async () => {
  setUser(USER_A);
  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  mockFetchCharacterPalette.mockClear();

  await act(async () => {
    await result.current.save([]);
  });

  expect(mockSavePaletteChanges).not.toHaveBeenCalled();
  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
});

test("選択種類が未確定の間は色を取得・保存せず、確定した種類で初めて取得する", async () => {
  useAppStore.setState({ user: user(USER_A) });
  const { result } = renderHook(() => useCharacterPalette());
  expect(result.current.isReady).toBe(false);
  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.save([{ color: "#4a90e2", slot: "skin" }]);
  });
  expect(mockSavePaletteChanges).not.toHaveBeenCalled();

  await act(async () => {
    useAppearanceStore.getState().setCharacterType("cat", USER_A);
  });
  expect(mockFetchCharacterPalette).toHaveBeenCalledWith(USER_A, "cat");
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().paletteLoadedCharacterType).toBe("cat");
});

test("同じ利用者が種類を変えると、新しい種類の色が取得できるまで前の色を使わせない", async () => {
  setUser(USER_A);
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);

  let resolveCat: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveCat = resolve)));
  act(() => useAppearanceStore.getState().setCharacterType("cat", USER_A));
  expect(result.current.isReady).toBe(false);
  expect(mockFetchCharacterPalette).toHaveBeenLastCalledWith(USER_A, "cat");

  await act(async () => resolveCat({ skin: "#f2a1c2" }));
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
  expect(useAppearanceStore.getState().paletteLoadedCharacterType).toBe("cat");

  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => useAppearanceStore.getState().setCharacterType("frog", USER_A));
  expect(mockFetchCharacterPalette).toHaveBeenLastCalledWith(USER_A, "frog");
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });
});

test("前の種類の取得が後から完了しても、選択中の種類の色を上書きしない", async () => {
  setUser(USER_A);
  let resolveFrog: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveFrog = resolve)));
  const { result } = renderHook(() => useCharacterPalette());

  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });
  await act(async () => useAppearanceStore.getState().setCharacterType("cat", USER_A));
  expect(result.current.isReady).toBe(true);
  await act(async () => resolveFrog({ skin: "#4fae3f" }));
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
  expect(useAppearanceStore.getState().paletteLoadedCharacterType).toBe("cat");
});

test("保存中に種類を変えた場合、保存は元の種類へ行い、完了後に新しい種類の取得を無効化しない", async () => {
  setUser(USER_A);
  const { result } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  let resolveSave: () => void = () => undefined;
  mockSavePaletteChanges.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
  const savePromise = result.current.save([{ color: "#4fae3f", slot: "skin" }]);

  let resolveCat: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveCat = resolve)));
  act(() => useAppearanceStore.getState().setCharacterType("cat", USER_A));
  mockFetchCharacterPalette.mockClear();
  await act(async () => {
    resolveSave();
    await savePromise;
  });
  expect(mockSavePaletteChanges).toHaveBeenCalledWith(USER_A, "frog", [{ color: "#4fae3f", slot: "skin" }]);
  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  await act(async () => resolveCat({ skin: "#f2a1c2" }));
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });
});

test("保存待ち中に別インスタンスの古い取得が終わっても、読み込み済みの色を巻き戻さない", async () => {
  setUser(USER_A);
  const { result } = renderHook(() => useCharacterPalette());
  mockFetchCharacterPalette.mockResolvedValue({ skin: "#f2a1c2" });
  await act(async () => { await result.current.reload(); });

  let resolveFetch: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
  renderHook(() => useCharacterPalette());
  let resolveSave: () => void = () => undefined;
  mockSavePaletteChanges.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
  const savePromise = result.current.save([{ color: "#4fae3f", slot: "skin" }]);
  await act(async () => resolveFetch({}));
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#f2a1c2" });

  mockFetchCharacterPalette.mockResolvedValue({ skin: "#4fae3f" });
  await act(async () => { resolveSave(); await savePromise; });
  expect(useAppearanceStore.getState().palette).toEqual({ skin: "#4fae3f" });
});

test("保存元の画面が閉じられて利用者が変わっても、古い保存完了から読み直さない", async () => {
  setUser(USER_A);
  const { result, unmount } = renderHook(() => useCharacterPalette());
  await act(async () => undefined);
  let resolveSave: () => void = () => undefined;
  mockSavePaletteChanges.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));
  const savePromise = result.current.save([{ color: "#4fae3f", slot: "skin" }]);
  unmount();

  setUser(USER_B, "cat");
  let resolveNext: (value: unknown) => void = () => undefined;
  mockFetchCharacterPalette.mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
  const { result: next } = renderHook(() => useCharacterPalette());
  mockFetchCharacterPalette.mockClear();
  await act(async () => { resolveSave(); await savePromise; });
  expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
  await act(async () => resolveNext({ skin: "#f2a1c2" }));
  expect(next.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().paletteLoadedFor).toBe(USER_B);
  expect(useAppearanceStore.getState().paletteLoadedCharacterType).toBe("cat");
});
