import { renderHook } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));

import { useCurrentUser } from "../store";

test("DEV_ROLE_OVERRIDEがchildのとき子供のモックユーザーを返す", () => {
  const { result } = renderHook(() => useCurrentUser());

  expect(result.current?.id).toBe("user-child-1");
  expect(result.current?.role).toBe("child");
});
