import { renderHook } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));

import { GUEST_USERS } from "../lib/guestUsers";
import { useCurrentUser } from "../store";

test("DEV_ROLE_OVERRIDEがchildのとき子供のゲストユーザーを返す", () => {
  const { result } = renderHook(() => useCurrentUser());

  expect(result.current?.id).toBe(GUEST_USERS.child.id);
  expect(result.current?.role).toBe("child");
});
