import { renderHook } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));

import { useCurrentUser } from "../store";

test("DEV_ROLE_OVERRIDEがparentのとき親のモックユーザーを返す", () => {
  const { result } = renderHook(() => useCurrentUser());

  expect(result.current?.id).toBe("user-parent-1");
  expect(result.current?.role).toBe("parent");
});
