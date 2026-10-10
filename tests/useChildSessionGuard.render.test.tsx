import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AppState } from "react-native";
const mockRpc = jest.fn<(...args: unknown[]) => Promise<any>>();
const mockGetSession = jest.fn<() => Promise<any>>();
const mockSignOut = jest.fn<(...args: unknown[]) => Promise<any>>();
let mockResume: ((state: string) => void) | undefined;
const mockRemove = jest.fn();
jest.mock("../lib/supabase", () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: { getSession: () => mockGetSession(), signOut: (...args: unknown[]) => mockSignOut(...args) },
} }));
import { useChildSessionGuard } from "../lib/useChildSessionGuard";
import { useAppStore } from "../store";
const child = { id: "child", role: "child" as const, family_id: "family", name: "たろう", balance: 0, created_at: "2026-10-10" };
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_name, callback) => {
    mockResume = callback; return { remove: mockRemove };
  });
  useAppStore.setState({ user: child });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "old-token" } } });
  mockSignOut.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => jest.useRealTimers());
test("別端末で失効した子供はセッションとストアを消す", async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: "PT401" } });
  renderHook(useChildSessionGuard);
  await act(async () => undefined);
  expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  expect(useAppStore.getState().user).toBeNull();
});
test("通信断ではログアウトせず、前面で30秒ごとと復帰時に確認する", async () => {
  mockRpc.mockRejectedValue(new Error("offline"));
  renderHook(useChildSessionGuard);
  await act(async () => undefined);
  await act(async () => jest.advanceTimersByTime(30_000));
  await act(async () => mockResume?.("active"));
  expect(mockRpc).toHaveBeenCalledTimes(3);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(useAppStore.getState().user).toEqual(child);
});
test("失効確認中に新しいセッションへ切り替わったら消さない", async () => {
  mockRpc.mockResolvedValue({ data: false, error: null });
  mockGetSession.mockResolvedValueOnce({ data: { session: { access_token: "old-token" } } })
    .mockResolvedValueOnce({ data: { session: { access_token: "new-token" } } });
  renderHook(useChildSessionGuard);
  await act(async () => undefined);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(useAppStore.getState().user).toEqual(child);
});
test("確認中に画面を破棄したら遅い応答でセッションを消さない", async () => {
  let finish!: (value: any) => void;
  mockRpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(useChildSessionGuard);
  await act(async () => undefined);
  hook.unmount();
  await act(async () => finish({ data: false, error: null }));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalled();
});
test("親と未ログインは子供セッションの問い合わせをしない", async () => {
  useAppStore.setState({ user: { ...child, role: "parent" } });
  const hook = renderHook(useChildSessionGuard);
  await act(async () => undefined);
  act(() => useAppStore.setState({ user: null }));
  await act(async () => undefined);
  expect(mockRpc).not.toHaveBeenCalled();
  hook.unmount();
});
