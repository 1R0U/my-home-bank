import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { type Href, router, Slot, Stack, Tabs } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import ChildSettingsScreen from "../components/ChildSettingsScreen";
import ParentSettingsScreen from "../components/ParentSettingsScreen";
import TutorialGuide from "../components/tutorial/TutorialGuide";
import TutorialProvider from "../components/tutorial/TutorialProvider";
import TutorialPressable, { TutorialHome } from "../components/tutorial/TutorialPressable";
import { useTutorial } from "../components/tutorial/TutorialContext";
import { useAppStore } from "../store";
import TutorialHarness from "./helpers/TutorialHarness";
import { tutorialScreenLayout } from "../components/tutorial/useTutorialNavigationLock";
import { iconButtonName } from "./iconButtonName";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: () => Promise.resolve("seen"), setItem: () => Promise.resolve(),
}));
jest.mock("../components/CharacterAvatar", () => () => null);
jest.mock("../components/settings/FamilyChildrenPanel", () => () => null);
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: () => Promise.resolve({}), updateUserSettings: () => Promise.resolve(),
}));

let mockRole: "parent" | "child" = "child";
let mockExplanation = false;
let mockHomeMounts = 0;

function Destination() {
  const tutorial = useTutorial();
  return <><TutorialHome feature="town" /><Pressable onPress={() => tutorial.start()}><Text>案内を開始</Text></Pressable></>;
}

function Home() {
  useEffect(() => { mockHomeMounts += 1; }, []);
  return <View><TutorialHome feature={mockRole === "parent" ? "home" : "town"} /><Text>ホーム本体</Text><Destination />
    <TutorialPressable tutorialId="parent-settings" onPress={() => router.push("/settings-adult")}><Text>案内の設定ボタン</Text></TutorialPressable>
  </View>;
}

function AdultLayout() {
  if (mockRole === "child") return <Slot />;
  return <Tabs id={undefined} screenLayout={tutorialScreenLayout} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="main-adult" />
  </Tabs>;
}

function Root() {
  const content = <><View style={{ flex: 1 }}><Stack id={undefined} screenLayout={tutorialScreenLayout} screenOptions={{ headerShown: false, animation: "none" }} /></View><TutorialGuide /></>;
  return mockExplanation
    ? <TutorialHarness initialStep="parent-home-summary">{content}</TutorialHarness>
    : <TutorialProvider userId="navigation-test" role={mockRole}>{content}</TutorialProvider>;
}

async function renderRoutes(initialUrl: string) {
  return renderRouter({
    _layout: Root,
    "(adult)/_layout": AdultLayout,
    "(adult)/main-adult": Home,
    // アプリと同じく、設定はタブではなくルート直下の Stack 画面（Issue #498）
    "settings-adult": ParentSettingsScreen,
    "settings-child": ChildSettingsScreen,
    "rpg-hub": () => mockRole === "child" ? <Home /> : <Destination />,
    "tasks-child": Destination,
    "bank-child": Destination,
    "history-child": Destination,
    wardrobe: Destination,
    "balance-adult": Destination,
    "notifications-adult": Destination,
    "loan-management": Destination,
    "savings-adult": Destination,
  }, { initialUrl });
}

/** Expo Routerの内部コンテナではなく、アプリのStackに積まれた画面を調べる。 */
function rootRoutes(view: Awaited<ReturnType<typeof renderRoutes>>) {
  return view.getRouterState().routes.find((route) => route.name === "__root").state.routes;
}

beforeEach(() => {
  mockExplanation = false;
  mockHomeMounts = 0;
  useAppStore.setState({ user: null });
});
afterEach(() => { jest.useRealTimers(); });

test.each(["/tasks-child", "/bank-child", "/history-child"])("子供が%sでやり直すとその機能の入口に留まり、町を重複させない", async (path) => {
  mockRole = "child";
  const view = await renderRoutes("/rpg-hub");
  await act(async () => undefined);
  await fireEvent.press(screen.getByText("案内を開始"));
  await act(() => router.push(path as Href));
  expect(view.getPathname()).toBe(path);
  expect(rootRoutes(view)).toHaveLength(2);
  await fireEvent.press(screen.getByText("案内を開始"));
  await fireEvent.press(screen.getByText("はじめから"));
  await waitFor(() => expect(view.getPathname()).toBe(path));
  expect(rootRoutes(view).filter((route) => route.name === "rpg-hub")).toHaveLength(1);
  expect(rootRoutes(view)).toHaveLength(2);
  expect(mockHomeMounts).toBe(1);
});

test.each(["/rpg-hub", "/balance-adult", "/notifications-adult", "/loan-management", "/savings-adult"])("大人が%sでやり直してもその機能とホームを重複させない", async (path) => {
  mockRole = "parent";
  const view = await renderRoutes("/main-adult");
  await act(async () => undefined);
  await fireEvent.press(screen.getByText("案内を開始"));
  await act(() => router.push(path as Href));
  expect(rootRoutes(view)).toHaveLength(2);
  await fireEvent.press(screen.getByText("案内を開始"));
  await fireEvent.press(screen.getByText("はじめから案内"));
  await waitFor(() => expect(view.getPathname()).toBe(path));
  expect(rootRoutes(view).filter((route) => route.name === "(adult)")).toHaveLength(1);
  expect(rootRoutes(view)).toHaveLength(2);
  expect(mockHomeMounts).toBe(1);
});

test.each(["parent", "child"] as const)("%sが設定から見直してもホームは1つだけになる", async (role) => {
  mockRole = role;
  useAppStore.setState({ user: { id: "navigation-test", role, name: "テスト", balance: 0, created_at: "2026-10-15T00:00:00Z" } });
  const homePath = role === "parent" ? "/main-adult" : "/rpg-hub";
  const view = await renderRoutes(homePath);
  await act(async () => undefined);
  await act(() => router.push(role === "parent" ? "/settings-adult" : "/settings-child"));
  await act(async () => undefined);
  await fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  await fireEvent.press(screen.getByRole("button", { name: role === "parent" ? "ホームと子供の追加の案内を見る" : "町の案内を見る" }));
  await waitFor(() => expect(view.getPathname()).toBe(homePath));
  expect(rootRoutes(view).map((route) => route.name)).toEqual([role === "parent" ? "(adult)" : "rpg-hub"]);
});

test("説明の画面へ戻る操作でも既存のホームへ戻り、説明の進捗を保つ", async () => {
  mockRole = "parent";
  mockExplanation = true;
  const view = await renderRoutes("/main-adult");
  await act(() => router.push("/notifications-adult"));
  await fireEvent.press(screen.getByText("説明の画面へ戻る"));
  await waitFor(() => expect(view.getPathname()).toBe("/main-adult"));
  expect(rootRoutes(view).map((route) => route.name)).toEqual(["(adult)"]);
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-home-summary");
  expect(mockHomeMounts).toBe(1);
});

test.each([false, true])("町を経由せずに開いてもその機能でやり直せる（戻る履歴: %s）", async (withHistory) => {
  mockRole = "child";
  const view = await renderRoutes("/bank-child");
  await act(async () => undefined);
  if (withHistory) await act(() => router.push("/tasks-child"));
  await fireEvent.press(screen.getByText("案内を開始"));
  await fireEvent.press(screen.getByText("はじめから"));
  await waitFor(() => expect(view.getPathname()).toBe(withHistory ? "/tasks-child" : "/bank-child"));
  expect(rootRoutes(view).filter((route) => route.name === "rpg-hub")).toHaveLength(0);
  if (!withHistory) expect(rootRoutes(view)).toHaveLength(1);
});

test("案内中は戻る操作で別画面へ移れず、案内を閉じると戻れる", async () => {
  mockRole = "child";
  const view = await renderRoutes("/rpg-hub");
  await act(async () => undefined);
  await act(() => router.push("/bank-child"));
  await fireEvent.press(screen.getByText("案内を開始"));
  await act(() => router.back());
  expect(view.getPathname()).toBe("/bank-child");
  await fireEvent.press(screen.getByText("あとでみる"));
  await act(() => router.back());
  await waitFor(() => expect(view.getPathname()).toBe("/rpg-hub"));
});

test("大人の初回案内は指定した設定ボタンで移動し、家族の説明を続けられる", async () => {
  mockRole = "parent";
  const view = await renderRoutes("/main-adult");
  await act(async () => undefined);
  await fireEvent.press(screen.getByText("案内を開始"));
  await fireEvent.press(screen.getByText("次へ"));
  await fireEvent.press(screen.getByText("案内の設定ボタン"));
  await waitFor(() => expect(view.getPathname()).toBe("/settings-adult"));
  await fireEvent.press(screen.getByRole("button", { name: iconButtonName("家族の子供") }));
  expect(screen.getByRole("header", { name: /子供を追加する/ })).toBeTruthy();
  await fireEvent.press(screen.getByText("はじめから案内"));
  await waitFor(() => expect(view.getPathname()).toBe("/main-adult"));
  expect(screen.getByRole("header", { name: /ホームの見方/ })).toBeTruthy();
});
