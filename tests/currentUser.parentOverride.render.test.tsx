import { renderHook } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));

import { GUEST_USERS } from "../lib/guestUsers";
import { useAppStore, useCurrentUser, useDataAccess } from "../store";

test("DEV_ROLE_OVERRIDEがparentのとき表示用の大人ゲストを返す", () => {
  useAppStore.setState({ user: null });
  const { result } = renderHook(() => useCurrentUser());

  expect(result.current?.id).toBe(GUEST_USERS.parent.id);
  expect(result.current?.role).toBe("parent");
});

test("開発用ロール指定だけではAuthセッション扱いにせず実データへ接続しない", () => {
  useAppStore.setState({ user: GUEST_USERS.parent });
  const { result } = renderHook(() => useDataAccess());

  expect(result.current.isLoggedIn).toBe(false);
  expect(result.current.canUseRealData).toBe(false);
});
