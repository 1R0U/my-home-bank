import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockRestoreAuthSession = jest.fn<() => Promise<any>>();
const mockUnsubscribe = jest.fn();
let authStateCallback: ((event: string, session: unknown) => void) | undefined;

jest.mock("expo-router", () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return { Stack };
});
jest.mock("../global.css", () => ({}));
// 未ログイン時の送り返し（Issue #274）は tests/authGate.render.test.tsx で確かめる。
// ここでは置かれていることだけを見る
jest.mock("../components/AuthGate", () => {
  const { Text } = require("react-native");
  return () => <Text>AuthGate</Text>;
});
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../lib/auth", () => ({
  restoreAuthSession: () => mockRestoreAuthSession(),
}));
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        authStateCallback = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));

import RootLayout from "../app/_layout";
import { useAppStore } from "../store";

const user = {
  balance: 0,
  created_at: "2026-09-22T00:00:00Z",
  family_id: "10000000-0000-4000-8000-000000000024",
  id: "00000000-0000-4000-8000-000000000024",
  name: "山田 太郎",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  authStateCallback = undefined;
  useAppStore.setState({ user: null });
});

test("起動時は保存済みセッションの復元完了までルートを表示しない", async () => {
  let completeRestore: ((value: unknown) => void) | undefined;
  mockRestoreAuthSession.mockReturnValue(
    new Promise((resolve) => {
      completeRestore = resolve;
    }),
  );

  render(<RootLayout />);
  expect(screen.getByLabelText("ログイン状態を確認中")).toBeTruthy();
  // 復元が終わる前に送り返すと、ログイン済みの人までログイン画面へ飛ばしてしまう
  expect(screen.queryByText("AuthGate")).toBeNull();

  await act(async () => {
    completeRestore?.({ error: null, user });
  });

  expect(screen.queryByLabelText("ログイン状態を確認中")).toBeNull();
  expect(screen.getByText("AuthGate")).toBeTruthy();
  expect(useAppStore.getState().user).toEqual(user);
});

test("SupabaseのSIGNED_OUT通知でstoreの利用者を消す", async () => {
  mockRestoreAuthSession.mockResolvedValue({ error: null, user });
  const view = render(<RootLayout />);
  await act(async () => undefined);

  act(() => authStateCallback?.("SIGNED_OUT", null));
  expect(useAppStore.getState().user).toBeNull();

  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test("SIGNED_OUT以外の通知でもセッションが無ければstoreの利用者を消す", async () => {
  mockRestoreAuthSession.mockResolvedValue({ error: null, user });
  render(<RootLayout />);
  await act(async () => undefined);

  act(() => authStateCallback?.("TOKEN_REFRESHED", null));

  expect(useAppStore.getState().user).toBeNull();
});

test("セッション消失後に完了した古い復元結果でstoreの利用者を戻さない", async () => {
  let completeRestore: ((value: unknown) => void) | undefined;
  mockRestoreAuthSession.mockReturnValue(
    new Promise((resolve) => {
      completeRestore = resolve;
    }),
  );
  render(<RootLayout />);

  act(() => authStateCallback?.("SIGNED_OUT", null));
  await act(async () => {
    completeRestore?.({ error: null, user });
  });

  expect(useAppStore.getState().user).toBeNull();
});
