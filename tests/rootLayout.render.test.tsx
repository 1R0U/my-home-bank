import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockRestoreAuthSession = jest.fn<() => Promise<any>>();
const mockUnsubscribe = jest.fn();
const mockStackProps = jest.fn();
let authStateCallback: ((event: string, session: unknown) => void) | undefined;

jest.mock("expo-router", () => {
  const Stack = Object.assign((props: unknown) => {
    mockStackProps(props);
    return null;
  }, { Screen: () => null });
  return { Stack, usePathname: () => "/main-adult" };
});
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: () => Promise.resolve("seen"),
  setItem: () => Promise.resolve(),
}));
jest.mock("../global.css", () => ({}));
const mockHideSplash = jest.fn<() => Promise<void>>(() => Promise.resolve());
jest.mock("expo-splash-screen", () => ({
  hideAsync: () => mockHideSplash(),
  preventAutoHideAsync: () => Promise.resolve(),
}));
jest.mock("../lib/useRecordAppOpen", () => ({ useRecordAppOpen: jest.fn() }));
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

import RootLayout, { unstable_settings } from "../app/_layout";
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
  // 確かめている間は、起動時のスプラッシュを出したままにする（Issue #261）
  expect(mockHideSplash).not.toHaveBeenCalled();

  await act(async () => {
    completeRestore?.({ error: null, user });
  });

  expect(mockHideSplash).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("ログイン状態を確認中")).toBeNull();
  expect(screen.getByText("AuthGate")).toBeTruthy();
  expect(useAppStore.getState().user).toEqual(user);
});

test("子供セッションの復元後は履歴画面ではなくホームの入口から起動する", async () => {
  mockRestoreAuthSession.mockResolvedValue({ error: null, user: { ...user, role: "child" } });
  render(<RootLayout />);
  await act(async () => undefined);

  // 実際のルーターで、先に定義した (adult) より index が選ばれることを確認する。
  // SDK 58では Stack の initialRouteName が無くなり、unstable_settings.anchor で指定する（Issue #485）
  const { Stack } = jest.requireActual<typeof import("expo-router")>("expo-router");
  const { renderRouter } = jest.requireActual<typeof import("expo-router/testing-library")>("expo-router/testing-library");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const view = await renderRouter({
    _layout: {
      default: () => <Stack id={undefined}><Stack.Screen name="(adult)" /></Stack>,
      unstable_settings,
    },
    "(adult)/history-adult": () => <Text>履歴</Text>,
    index: () => <Text>入口</Text>,
    "rpg-hub": () => <Text>町</Text>,
  }, { initialUrl: "/rpg-hub" });
  const rootRoutes = view.getRouterState().routes.find((route) => route.name === "__root").state.routes;

  expect(rootRoutes.map((route) => route.name)).toEqual(["index", "rpg-hub"]);
  expect(useAppStore.getState().user?.role).toBe("child");
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
