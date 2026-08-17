import assert from "node:assert/strict";
import test from "node:test";
import { getMockCurrentUser, MOCK_CURRENT_USER } from "../constants/mockData.ts";

test("roleがparentの場合は親ユーザーを返す", () => {
  const user = getMockCurrentUser("parent");
  assert.equal(user.role, "parent");
});

test("roleがchildの場合は子供ユーザー（MOCK_CURRENT_USER）を返す", () => {
  assert.deepEqual(getMockCurrentUser("child"), MOCK_CURRENT_USER);
});

test("roleが未指定の場合は子供ユーザー（MOCK_CURRENT_USER）を返す", () => {
  assert.deepEqual(getMockCurrentUser(undefined), MOCK_CURRENT_USER);
});
