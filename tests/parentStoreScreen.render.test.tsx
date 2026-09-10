import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { StoreItemRequest } from "../types";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));
jest.mock("../components/nav/AdultBottomNav", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/ScreenHeader", () => ({ __esModule: true, default: () => null }));

let mockCurrentUser: { id: string } | null = null;
jest.mock("../store", () => ({
  useCurrentUser: () => mockCurrentUser,
}));

jest.mock("../lib/useStoreItems", () => ({
  useStoreItems: () => ({ items: [], isLive: true, reload: jest.fn(), error: null }),
}));

const pendingRequest: StoreItemRequest = {
  id: "req-1",
  requested_by: "child-x",
  title: "テスト申請",
  description: "説明",
  reason: "理由",
  image_url: "",
  status: "pending",
  created_at: "2026-09-10T00:00:00Z",
  approved_by: null,
  approved_at: null,
};
jest.mock("../lib/useStoreItemRequests", () => ({
  useStoreItemRequests: () => ({
    requests: [pendingRequest],
    isLive: true,
    reload: jest.fn(),
    error: null,
  }),
}));

const mockFetchFamilyUsers = jest.fn<() => Promise<{ id: string; name: string }[]>>();
jest.mock("../lib/storeService", () => ({
  fetchFamilyUsers: () => mockFetchFamilyUsers(),
  createStoreItem: jest.fn(),
}));

import ParentStoreScreen from "../components/ParentStoreScreen";

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
});

test("ユーザー切り替え時、先に開始した家族一覧取得が後から完了しても新しい一覧を上書きしない", async () => {
  // 取得を任意のタイミングで解決できるようにする
  const resolvers: ((users: { id: string; name: string }[]) => void)[] = [];
  mockFetchFamilyUsers.mockImplementation(
    () => new Promise((resolve) => resolvers.push(resolve)),
  );

  mockCurrentUser = { id: "parent-A" };
  const { rerender } = render(<ParentStoreScreen />);

  // 親A→親Bへ切り替え（どちらも isLive）
  mockCurrentUser = { id: "parent-B" };
  rerender(<ParentStoreScreen />);

  expect(resolvers).toHaveLength(2);

  // Bの結果を先に、Aの結果を後に解決する（順序が逆転したケース）
  await act(async () => {
    resolvers[1]([{ id: "child-x", name: "ビー家の子" }]);
  });
  await act(async () => {
    resolvers[0]([{ id: "child-x", name: "エー家の子" }]);
  });

  fireEvent.press(screen.getByRole("button", { name: /申請/ }));

  expect(screen.getByText("申請者: ビー家の子")).toBeTruthy();
  expect(screen.queryByText("申請者: エー家の子")).toBeNull();
});
