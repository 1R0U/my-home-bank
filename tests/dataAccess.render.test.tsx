import { renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

import { GUEST_USERS } from "../lib/guestUsers";
import { useAppStore, useDataAccess, useDisplayUser } from "../store";

const uuidUser = {
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
  id: "11111111-1111-1111-1111-111111111111",
  name: "お父さん",
  role: "parent" as const,
};

/** ログイン画面のモックアカウントで入ったときのユーザー。IDがUUIDではない */
const mockAccountUser = { ...uuidUser, id: "user-parent-1" };

beforeEach(() => {
  useAppStore.setState({ user: null });
});

test("未ログインなら、どちらも false", () => {
  const { result } = renderHook(() => useDataAccess());

  expect(result.current.isLoggedIn).toBe(false);
  expect(result.current.canUseRealData).toBe(false);
});

test("UUIDのユーザーなら、どちらも true", () => {
  useAppStore.setState({ user: uuidUser });

  const { result } = renderHook(() => useDataAccess());

  expect(result.current.isLoggedIn).toBe(true);
  expect(result.current.canUseRealData).toBe(true);
});

test("非UUIDのモックIDでは、ログイン済みだが実データは扱えない", () => {
  // #174 のガード。ここが1か所にまとまっていなかったため、画面ごとに書き忘れが起きていた
  useAppStore.setState({ user: mockAccountUser });

  const { result } = renderHook(() => useDataAccess());

  expect(result.current.isLoggedIn).toBe(true);
  expect(result.current.canUseRealData).toBe(false);
});

test("ゲストユーザーは実データを扱える", () => {
  // start:parent / start:child はここを通る（#211）
  useAppStore.setState({ user: GUEST_USERS.parent });

  const { result } = renderHook(() => useDataAccess());

  expect(result.current.canUseRealData).toBe(true);
});

// --- 表示用のユーザー ---

test("ログイン中なら、そのユーザーを返す", () => {
  useAppStore.setState({ user: uuidUser });

  const { result } = renderHook(() => useDisplayUser("parent"));

  expect(result.current.id).toBe(uuidUser.id);
});

test("未ログインなら、指定したロールのモックへフォールバックする", () => {
  const { result } = renderHook(() => useDisplayUser("child"));

  expect(result.current.role).toBe("child");
  // フォールバックしたIDは非UUID。実データの読み書きには使われない
  expect(result.current.id).not.toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
});
