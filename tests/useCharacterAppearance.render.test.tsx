import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchCharacterType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSaveCharacterType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterType: (...args: unknown[]) => mockFetchCharacterType(...args),
  saveCharacterType: (...args: unknown[]) => mockSaveCharacterType(...args),
}));

import { useCharacterAppearance } from "../lib/useCharacterAppearance";
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
  useAppearanceStore.setState({ characterType: "frog", characterTypeLoadedFor: null });
  mockFetchCharacterType.mockResolvedValue("frog");
  mockSaveCharacterType.mockResolvedValue(undefined);
});

test("読み込んだ種類が反映され、isReadyがtrueになる", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockResolvedValue("cat");

  const { result } = renderHook(() => useCharacterAppearance());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().characterType).toBe("cat");
  expect(result.current.isReady).toBe(true);
});

test("モックアカウントでは既定（frog）のままにし、実APIを呼ばずに即isReadyになる", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）
  useAppStore.setState({ user: user("user-child-1") });

  const { result } = renderHook(() => useCharacterAppearance());

  expect(mockFetchCharacterType).not.toHaveBeenCalled();
  expect(useAppearanceStore.getState().characterType).toBe("frog");
  expect(result.current.isReady).toBe(true);
});

test("未ログインなら実APIを呼ばず、即isReadyになる", () => {
  const { result } = renderHook(() => useCharacterAppearance());

  expect(mockFetchCharacterType).not.toHaveBeenCalled();
  expect(result.current.isReady).toBe(true);
});

test("ユーザーが変わったら、次の取得が終わるまでisReadyがfalseになる（前の人の種類を出さない）", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockResolvedValue("hamster");

  const { result, rerender } = renderHook(() => useCharacterAppearance());
  await act(async () => undefined);
  expect(useAppearanceStore.getState().characterType).toBe("hamster");
  expect(result.current.isReady).toBe(true);

  // 次の人の取得は終わらせない。呼び出し側はisReadyがfalseの間、
  // characterType（前の人の"hamster"のまま）を使わないので前の人の種類は見えない（#147と同じ考え方）
  let resolveNext: (value: unknown) => void = () => undefined;
  mockFetchCharacterType.mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  expect(result.current.isReady).toBe(false);

  await act(async () => {
    resolveNext("frog");
    await Promise.resolve();
  });
  expect(result.current.isReady).toBe(true);
  expect(useAppearanceStore.getState().characterType).toBe("frog");
});

test("取得に失敗したら既定へ戻し、isReadyはtrueになる", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockRejectedValue(new Error("network"));

  const { result } = renderHook(() => useCharacterAppearance());
  await act(async () => undefined);

  expect(useAppearanceStore.getState().characterType).toBe("frog");
  expect(result.current.isReady).toBe(true);
});

test("selectは保存してから取り直す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockResolvedValue("frog");

  const { result } = renderHook(() => useCharacterAppearance());
  await act(async () => undefined);

  mockFetchCharacterType.mockResolvedValue("cat");
  await act(async () => {
    await result.current.select("cat");
  });

  expect(mockSaveCharacterType).toHaveBeenCalledWith(USER_A, "cat");
  expect(useAppearanceStore.getState().characterType).toBe("cat");
});

test("selectは保存中に別のユーザーへ切り替わっていたら読み直さない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockResolvedValue("frog");

  const { result, rerender } = renderHook(() => useCharacterAppearance());
  await act(async () => undefined);

  let resolveSave: () => void = () => undefined;
  mockSaveCharacterType.mockReturnValue(new Promise<void>((resolve) => (resolveSave = resolve)));

  const selectPromise = result.current.select("cat");

  // 保存が終わる前にユーザーが切り替わる
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);
  mockFetchCharacterType.mockClear();

  resolveSave();
  await act(async () => {
    await selectPromise;
  });

  expect(mockFetchCharacterType).not.toHaveBeenCalled();
});
