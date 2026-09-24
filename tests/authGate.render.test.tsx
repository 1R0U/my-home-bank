import { act, render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockNavigationKey: string | undefined = "root";

jest.mock("expo-router", () => ({
  useRootNavigationState: () => (mockNavigationKey ? { key: mockNavigationKey } : undefined),
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

import AuthGate from "../components/AuthGate";
import { useAppStore } from "../store";

const parent = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id: "11111111-1111-1111-1111-111111111111",
  name: "おとうさん",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ["(adult)", "main-adult"];
  mockNavigationKey = "root";
  useAppStore.setState({ user: parent });
});

test("ログイン中は何もしない", () => {
  render(<AuthGate />);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("ログイン中にセッションが切れたら、ログイン画面へ送り返す", () => {
  render(<AuthGate />);

  act(() => {
    useAppStore.setState({ user: null });
  });

  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("未ログインのまま大人用の画面へ直接入ったら、ログイン画面へ送り返す", () => {
  useAppStore.setState({ user: null });
  render(<AuthGate />);
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("未ログインでもログイン画面・新規登録にいるときは送り返さない", () => {
  useAppStore.setState({ user: null });

  mockSegments = ["login"];
  render(<AuthGate />);
  mockSegments = ["family-registration"];
  render(<AuthGate />);

  expect(mockReplace).not.toHaveBeenCalled();
});

test("ナビゲーションの準備ができるまでは遷移しない", () => {
  useAppStore.setState({ user: null });
  mockNavigationKey = undefined;
  render(<AuthGate />);
  expect(mockReplace).not.toHaveBeenCalled();
});
