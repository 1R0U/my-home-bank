import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CHILD_THEME } from "../components/childTheme";
import { type ReactNode, useEffect } from "react";
import TutorialProvider from "../components/tutorial/TutorialProvider";
import TutorialGuide from "../components/tutorial/TutorialGuide";
import TutorialPressable, { TutorialHome } from "../components/tutorial/TutorialPressable";
import { useTutorial } from "../components/tutorial/TutorialContext";
import { tutorialStorageKey } from "../lib/tutorial";
import { useAppStore } from "../store";

const mockRead = jest.fn<(key: string) => Promise<string | null>>();
const mockWrite = jest.fn<(key: string, value: string) => Promise<void>>();
const mockReplace = jest.fn();
const mockAction = jest.fn();
let mockPath = "/main-adult";
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (key: string) => mockRead(key),
  setItem: (key: string, value: string) => mockWrite(key, value),
}));
jest.mock("expo-router", () => ({
  usePathname: () => mockPath,
  router: { replace: (href: string) => mockReplace(href) },
}));

function Controls() {
  const tutorial = useTutorial();
  return <View>
    <Text testID="step">{tutorial?.step?.id ?? "idle"}</Text>
    <Pressable accessibilityRole="button" onPress={tutorial?.start}><Text>設定から見直す</Text></Pressable>
    <TutorialPressable tutorialId="nav-tasks-adult" onPress={mockAction}><Text>実際のタスクボタン</Text></TutorialPressable>
    <TutorialPressable tutorialId="parent-daily"><Text>実際のデイリーボタン</Text></TutorialPressable>
    <TutorialPressable tutorialId="town-tasks" disabled><Text>無効なボタン</Text></TutorialPressable>
    <TutorialPressable tutorialId="town-tasks"><Text>タスクに入る</Text></TutorialPressable>
  </View>;
}

function Session({ userId = "a", role = "parent", ready = true, children }: {
  userId?: string; role?: "parent" | "child"; ready?: boolean; children?: ReactNode;
}) {
  return <TutorialProvider userId={userId} role={role}>
    <TutorialHome ready={ready} /><Controls />{children}<TutorialGuide />
  </TutorialProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue(null);
  mockWrite.mockResolvedValue();
  mockPath = "/main-adult";
  useAppStore.setState({ user: null });
});

test("ホームの準備後に初回だけ提示し、実際の操作を保ったまま対象の枠だけを進める", async () => {
  const view = render(<Session ready={false} />);
  await act(async () => undefined);
  expect(screen.queryByText("案内をはじめる")).toBeNull();
  view.rerender(<Session ready />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(mockWrite).toHaveBeenCalledWith(tutorialStorageKey("a", "parent"), "seen");
  expect(screen.getByTestId("tutorial-frame-nav-tasks-adult").props.pointerEvents).toBe("none");
  fireEvent.press(screen.getByText("実際のデイリーボタン"));
  expect(screen.getByTestId("step").props.children).toBe("nav-tasks-adult");
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  expect(mockAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("tutorial-frame-nav-tasks-adult")).toBeNull();
  expect(screen.getByTestId("tutorial-frame-parent-daily")).toBeTruthy();
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  expect(screen.getByTestId("step").props.children).toBe("parent-daily");
  fireEvent.press(screen.getByText("案内を閉じる"));
  expect(screen.queryByText("案内をはじめる")).toBeNull();
});

test("表示済みでも設定から再開でき、やり直すとホームへ戻る", async () => {
  mockRead.mockResolvedValue("seen");
  render(<Session />);
  await act(async () => undefined);
  expect(screen.queryByText("案内をはじめる")).toBeNull();
  fireEvent.press(screen.getByText("設定から見直す"));
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  fireEvent.press(screen.getByText("はじめから案内"));
  expect(mockReplace).toHaveBeenCalledWith("/main-adult");
  expect(screen.getByTestId("step").props.children).toBe("nav-tasks-adult");
});

test("子供は別の文章と順番で進み、無効なボタンでは進まない", async () => {
  useAppStore.setState({ user: { id: "b", name: "こども", role: "child", balance: 0, created_at: "2026-10-14T00:00:00Z" } });
  mockPath = "/rpg-hub";
  render(<Session role="child" />);
  fireEvent.press(await screen.findByText("はじめる"));
  expect(screen.getByTestId("step").props.children).toBe("town-tasks");
  const frame = screen.getAllByTestId("tutorial-frame-town-tasks")[1];
  expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
    borderColor: CHILD_THEME.tutorialRed, borderWidth: 3, top: -9, bottom: -9, left: -9, right: -9,
  });
  expect(frame.props.pointerEvents).toBe("none");
  fireEvent.press(screen.getByText("無効なボタン"));
  expect(screen.getByTestId("step").props.children).toBe("town-tasks");
  fireEvent.press(screen.getByText("タスクに入る"));
  expect(screen.getByTestId("step").props.children).toBe("child-weekly");
  expect(screen.getByRole("text", { name: /枠の「ウィークリー」/ })).toBeTruthy();
});

test("利用者の切り替えで画面を再マウントせず、案内の進捗だけを消す", async () => {
  const mounted = jest.fn();
  function MountedScreen() {
    useEffect(() => { mounted(); }, []);
    return null;
  }
  const view = render(<Session><MountedScreen /></Session>);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  view.rerender(<Session userId="b"><MountedScreen /></Session>);
  expect(screen.getByTestId("step").props.children).toBe("idle");
  expect(mounted).toHaveBeenCalledTimes(1);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(screen.getByTestId("step").props.children).toBe("nav-tasks-adult");
});

test("古い保存の失敗が後から届いても、再保存の成功を取り消さない", async () => {
  let rejectOld: (error: Error) => void;
  mockWrite.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  fireEvent.press(screen.getByText("はじめから案内"));
  await act(async () => { rejectOld(new Error("古い書込の失敗")); });
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
});

test("別の利用者へ切り替わった後に古い保存履歴が届いても混ざらない", async () => {
  let resolveOld: (value: string | null) => void;
  mockRead.mockImplementation((key) => key === tutorialStorageKey("a", "parent")
    ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(null));
  const view = render(<Session />);
  view.rerender(<Session userId="b" />);
  await act(async () => { resolveOld("seen"); });
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(mockWrite).toHaveBeenCalledWith(tutorialStorageKey("b", "parent"), "seen");
  expect(mockWrite).not.toHaveBeenCalledWith(tutorialStorageKey("a", "parent"), "seen");
});

test("初回に閉じた履歴も保存し、同じ利用者の次の起動では自動表示しない", async () => {
  const view = render(<Session />);
  fireEvent.press(await screen.findByText("案内を閉じる"));
  expect(mockWrite).toHaveBeenCalledWith(tutorialStorageKey("a", "parent"), "seen");
  view.unmount();
  mockRead.mockResolvedValue("seen");
  render(<Session />);
  await act(async () => undefined);
  expect(screen.queryByText("案内をはじめる")).toBeNull();
});

test("保存に失敗しても操作を続けられ、保存を再試行できる", async () => {
  mockWrite.mockRejectedValueOnce(new Error("保存不可"));
  render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(await screen.findByText("表示履歴の保存を再試行")).toBeTruthy();
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  expect(screen.getByTestId("step").props.children).toBe("parent-daily");
  fireEvent.press(screen.getByText("表示履歴の保存を再試行"));
  await act(async () => undefined);
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
});

test("保存履歴の読込中に見直しを始めても、遅い応答で巻き戻らない", async () => {
  let completeRead: (value: string | null) => void;
  mockRead.mockImplementation(() => new Promise((resolve) => { completeRead = resolve; }));
  render(<Session />);
  fireEvent.press(screen.getByText("設定から見直す"));
  fireEvent.press(screen.getByText("実際のタスクボタン"));
  await act(async () => { completeRead(null); });
  expect(screen.getByTestId("step").props.children).toBe("parent-daily");
});
