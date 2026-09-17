import { renderHook } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));

import { GUEST_USERS } from "../lib/guestUsers";
import { useCurrentUser } from "../store";

test("DEV_ROLE_OVERRIDEがparentのとき大人のゲストユーザーを返す", () => {
  // モックユーザー（非UUID）だと実DBを一切読み書きできない。
  // Issue #211 以降、開発用ロール指定では seed 済みのゲストを返す
  const { result } = renderHook(() => useCurrentUser());

  expect(result.current?.id).toBe(GUEST_USERS.parent.id);
  expect(result.current?.role).toBe("parent");
});
