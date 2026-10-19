import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type ReactNode, useEffect } from "react";
import { CHILD_THEME } from "../components/childTheme";
import TutorialProvider from "../components/tutorial/TutorialProvider";
import TutorialGuide from "../components/tutorial/TutorialGuide";
import TutorialPressable, { TutorialHome } from "../components/tutorial/TutorialPressable";
import TutorialReplay from "../components/tutorial/TutorialReplay";
import TutorialSession from "../components/tutorial/TutorialSession";
import { useTutorial, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { featureStorageKey } from "../lib/tutorialFeatures";
import { useAppStore } from "../store";

const mockRead = jest.fn<(key: string) => Promise<string | null>>();
const mockWrite = jest.fn<(key: string, value: string) => Promise<void>>();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockAction = jest.fn();
const mockOtherScreen = jest.fn();
const mockSound = jest.fn();
let mockPath = "/main-adult";
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (key: string) => mockRead(key), setItem: (key: string, value: string) => mockWrite(key, value),
}));
jest.mock("../lib/audio", () => ({ playSoundEffect: (name: string) => mockSound(name) }));
jest.mock("expo-router", () => ({
  usePathname: () => mockPath,
  router: { replace: (href: string) => mockReplace(href), push: jest.fn(), dismissTo: (href: string) => mockDismissTo(href), canDismiss: () => true },
}));

function Controls() {
  const tutorial = useTutorial();
  return <View>
    <Text testID="step">{tutorial?.step?.id ?? "idle"}</Text>
    <Text testID="feature">{tutorial?.feature}</Text>
    <Pressable onPress={() => tutorial?.start()}><Text>この機能を見直す</Text></Pressable>
    <TutorialPressable tutorialId="parent-settings"><Text>設定を開く</Text></TutorialPressable>
    <TutorialPressable tutorialId="parent-settings-family"><Text>家族を開く</Text></TutorialPressable>
    <TutorialPressable tutorialId="parent-daily" onPress={mockAction}><Text>デイリー</Text></TutorialPressable>
    <TutorialPressable tutorialId="parent-create"><Text>タスク追加</Text></TutorialPressable>
    <TutorialPressable tutorialId="child-weekly" disabled><Text>無効なボタン</Text></TutorialPressable>
    <TutorialPressable tutorialId="child-weekly"><Text>ウィークリー</Text></TutorialPressable>
    <TutorialPressable tutorialId="child-daily"><Text>子供のデイリー</Text></TutorialPressable>
    <TutorialPressable onPress={mockOtherScreen}><Text>別の画面へ移る</Text></TutorialPressable>
  </View>;
}
function Session({ userId = "a", role = "parent", ready = true, hub = "town", children }: {
  userId?: string | null; role?: "parent" | "child"; ready?: boolean; hub?: "town" | "house"; children?: ReactNode;
}) {
  return <TutorialProvider userId={userId} role={role}>
    <TutorialHome feature={mockPath === "/rpg-hub" ? hub : "home"} ready={ready} />
    <Controls /><TutorialReplay role={role} />{children}<TutorialGuide />
  </TutorialProvider>;
}
const step = () => screen.getByTestId("step").props.children;
const next = () => fireEvent.press(screen.getByText("次へ"));
const close = () => fireEvent.press(screen.getByText("案内を閉じる"));

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue(null);
  mockWrite.mockResolvedValue();
  mockPath = "/main-adult";
  useAppStore.setState({ user: null });
});

test("大人の初回はホーム→設定→子供追加→コードログインだけで終了する", async () => {
  const view = render(<Session ready={false} />);
  await act(async () => undefined);
  expect(screen.queryByText("案内をはじめる")).toBeNull();
  view.rerender(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(step()).toBe("parent-home-summary");
  expect(mockWrite).toHaveBeenCalledWith(featureStorageKey("a", "parent", "home"), "seen");
  next();
  expect(step()).toBe("parent-settings");
  fireEvent.press(screen.getByText("設定を開く"));
  mockPath = "/settings-adult";
  view.rerender(<Session />);
  expect(step()).toBe("parent-settings-family");
  fireEvent.press(screen.getByText("家族を開く"));
  expect(step()).toBe("parent-family-add");
  next();
  expect(step()).toBe("parent-family-code");
  next();
  expect(step()).toBe("done");
  expect(mockWrite).toHaveBeenCalledWith(featureStorageKey("a", "parent", "family"), "seen");
  fireEvent.press(screen.getByText("案内を終える"));
  expect(screen.queryByTestId("tutorial-guide")).toBeNull();
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  expect(mockWrite.mock.calls.map(([key]) => key)).not.toContain(featureStorageKey("a", "parent", "settings"));
  mockPath = "/tasks-adult";
  view.rerender(<Session />);
  close();
  mockPath = "/settings-adult";
  view.rerender(<Session />);
  expect(screen.getByTestId("tutorial-offer")).toBeTruthy();
}, 15000);

test("対象外の操作と連打では飛ばさず、通常のボタンの処理も実行する", async () => {
  mockPath = "/tasks-adult";
  render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(step()).toBe("parent-daily");
  expect(screen.getByTestId("tutorial-frame-parent-daily").props.pointerEvents).toBe("none");
  fireEvent.press(screen.getByText("タスク追加"));
  expect(step()).toBe("parent-daily");
  fireEvent.press(screen.getByText("デイリー"));
  expect(mockAction).toHaveBeenCalledTimes(1);
  expect(step()).toBe("parent-create");
  fireEvent.press(screen.getByText("デイリー"));
  expect(step()).toBe("parent-create");
  expect(mockAction).toHaveBeenCalledTimes(1);
});

test("案内中は対象以外の移動ボタンを操作できず、閉じると通常どおり操作できる", async () => {
  mockPath = "/tasks-adult";
  render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  fireEvent.press(screen.getByText("別の画面へ移る"));
  expect(mockOtherScreen).not.toHaveBeenCalled();
  close();
  fireEvent.press(screen.getByText("別の画面へ移る"));
  expect(mockOtherScreen).toHaveBeenCalledTimes(1);
});

test.each(["parent", "child"] as const)("%sの積立案内は専用画面で始まり、見直しも同じ画面へ戻る", async (role) => {
  const path = role === "parent" ? "/savings-adult" : "/savings-child";
  mockPath = path;
  render(<Session role={role} />);
  fireEvent.press(await screen.findByText(role === "parent" ? "案内をはじめる" : "はじめる"));
  expect(step()).toBe(`${role}-savings-summary`);
  fireEvent.press(screen.getByText(role === "parent" ? "はじめから案内" : "はじめから"));
  expect(mockDismissTo).not.toHaveBeenCalled();
  next();
  expect(step()).toBe("done");
});

test.each(["parent", "child"] as const)("%sの案内は任意の機能から始められ、履歴を機能ごとに保存する", async (role) => {
  const paths = role === "parent" ? ["/store-adult", "/bank-adult", "/history-adult", "/tasks-adult"] : ["/store-child", "/history-child", "/bank-child", "/tasks-child"];
  mockPath = paths[0];
  const view = render(<Session role={role} />);
  for (const path of paths) {
    mockPath = path;
    view.rerender(<Session role={role} />);
    const offer = await screen.findByTestId("tutorial-offer");
    act(() => offer.props.onRequestClose());
    expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  }
  expect(new Set(mockWrite.mock.calls.map(([key]) => key)).size).toBe(4);
  mockPath = paths[0];
  view.rerender(<Session role={role} />);
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
});

test("開始確認の後は画面に重ねて説明し、終了すると非表示にする", async () => {
  mockPath = "/bank-adult";
  render(<Session />);
  expect(await screen.findByTestId("tutorial-offer-card")).toBeTruthy();
  expect(screen.queryByTestId("tutorial-guide")).toBeNull();
  fireEvent.press(screen.getByText("案内をはじめる"));
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  expect(screen.getByTestId("tutorial-guide")).toBeTruthy();
  next();
  expect(step()).toBe("done");
  fireEvent.press(screen.getByText("案内を終える"));
  expect(screen.queryByTestId("tutorial-guide")).toBeNull();
});

test("外部からパスが変わった場合は元の案内を隠し、戻るとその起動中の続きから再開する", async () => {
  mockPath = "/tasks-adult";
  const view = render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  fireEvent.press(screen.getByText("デイリー"));
  mockPath = "/bank-adult";
  view.rerender(<Session />);
  expect(step()).toBe("idle");
  expect(screen.queryByTestId("tutorial-frame-parent-create")).toBeNull();
  close();
  mockPath = "/tasks-adult";
  view.rerender(<Session />);
  expect(step()).toBe("parent-create");
  mockPath = "/login";
  view.rerender(<Session />);
  expect(screen.queryByTestId("tutorial-guide")).toBeNull();
});

test("子供はその画面の案内だけを赤枠で進め、無効なボタンでは進まない", async () => {
  mockPath = "/tasks-child";
  render(<Session role="child" />);
  fireEvent.press(await screen.findByText("はじめる"));
  expect(step()).toBe("child-weekly");
  const frame = screen.getAllByTestId("tutorial-frame-child-weekly")[1];
  expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ borderColor: CHILD_THEME.tutorialRed, borderWidth: 3, top: -9 });
  fireEvent.press(screen.getByText("無効なボタン"));
  expect(step()).toBe("child-weekly");
  fireEvent.press(screen.getByText("ウィークリー"));
  expect(step()).toBe("child-daily");
  fireEvent.press(screen.getByText("子供のデイリー"));
  next();
  expect(step()).toBe("done");
});

test("町と家は同じ画面でも独立し、シーン準備後にだけ案内する", async () => {
  mockPath = "/rpg-hub";
  const view = render(<Session role="child" ready={false} />);
  await act(async () => undefined);
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  view.rerender(<Session role="child" />);
  act(() => screen.getByTestId("tutorial-offer").props.onRequestClose());
  view.rerender(<Session role="child" hub="house" />);
  fireEvent.press(screen.getByText("はじめる"));
  expect(step()).toBe("child-house-summary");
  view.rerender(<Session role="child" hub="town" />);
  expect(screen.queryByTestId("tutorial-guide")).toBeNull();
  view.rerender(<Session role="child" hub="house" />);
  expect(step()).toBe("child-house-summary");
});

test("見直しは機能を選んで開始し、やり直してもその機能の入口へ戻る", async () => {
  mockRead.mockResolvedValue("seen");
  mockPath = "/settings-adult";
  const view = render(<Session />);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  fireEvent.press(screen.getByRole("button", { name: "タスクの案内を見る" }));
  expect(mockDismissTo).toHaveBeenCalledWith("/tasks-adult");
  mockPath = "/tasks-adult";
  view.rerender(<Session />);
  expect(step()).toBe("parent-daily");
  fireEvent.press(screen.getByText("デイリー"));
  fireEvent.press(screen.getByText("はじめから案内"));
  expect(mockDismissTo).toHaveBeenLastCalledWith("/tasks-adult");
  expect(step()).toBe("parent-daily");
});

test("機能ごとの保存済み履歴は再起動後も保持し、旧一括履歴は新しい案内を妨げない", async () => {
  mockRead.mockImplementation((key) => Promise.resolve(key.includes(":v1:") || key.endsWith(":bank") ? "seen" : null));
  mockPath = "/bank-adult";
  const view = render(<Session />);
  await act(async () => undefined);
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  view.unmount();
  mockPath = "/history-adult";
  render(<Session />);
  expect(await screen.findByTestId("tutorial-offer")).toBeTruthy();
});

test("利用者とロールの切り替え直後に前の人の案内を消し、画面本体は保つ", async () => {
  const mounted = jest.fn();
  function Body() { useEffect(() => { mounted(); }, []); return null; }
  mockPath = "/bank-adult";
  const view = render(<Session><Body /></Session>);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  view.rerender(<Session userId="b"><Body /></Session>);
  expect(step()).toBe("idle");
  fireEvent.press(await screen.findByText("案内をはじめる"));
  mockPath = "/bank-child";
  view.rerender(<Session userId="b" role="child"><Body /></Session>);
  expect(step()).toBe("idle");
  fireEvent.press(await screen.findByText("はじめる"));
  expect(step()).toBe("child-bank-summary");
  expect(mounted).toHaveBeenCalledTimes(1);
});

test("別利用者への切り替え後に古い読込が届いても表示履歴を混ぜない", async () => {
  const resolveOld: Array<(value: string | null) => void> = [];
  mockRead.mockImplementation((key) => key.startsWith("tutorial:v2:parent:a:")
    ? new Promise((resolve) => { resolveOld.push(resolve); }) : Promise.resolve(null));
  mockPath = "/bank-adult";
  const view = render(<Session />);
  view.rerender(<Session userId="b" />);
  await act(async () => { resolveOld.forEach((resolve) => resolve("seen")); });
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(mockWrite).toHaveBeenCalledWith(featureStorageKey("b", "parent", "bank"), "seen");
  expect(mockWrite).not.toHaveBeenCalledWith(featureStorageKey("a", "parent", "bank"), "seen");
});

test("保存失敗を再試行でき、古い失敗で再保存の成功を取り消さない", async () => {
  let rejectOld: (error: Error) => void;
  mockWrite.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  mockPath = "/bank-adult";
  render(<Session />);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  fireEvent.press(screen.getByText("はじめから案内"));
  await act(async () => { rejectOld(new Error("古い保存失敗")); });
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
  mockWrite.mockRejectedValueOnce(new Error("保存失敗"));
  close();
  expect(await screen.findByText("表示履歴の保存を再試行")).toBeTruthy();
  fireEvent.press(screen.getByText("表示履歴の保存を再試行"));
  await act(async () => undefined);
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
});

test("読込中に見直しを始めても遅い応答で進捗を巻き戻さない", async () => {
  const pending: Array<(value: string | null) => void> = [];
  mockRead.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
  mockPath = "/tasks-adult";
  render(<Session />);
  fireEvent.press(screen.getByText("この機能を見直す"));
  fireEvent.press(screen.getByText("デイリー"));
  await act(async () => { pending.forEach((resolve) => resolve(null)); });
  expect(step()).toBe("parent-create");
});

test("保存エラーの表示と再試行は現在の機能だけに限定する", async () => {
  let currentTutorial: TutorialContextValue;
  function Probe() {
    currentTutorial = useTutorial();
    return null;
  }
  mockRead.mockResolvedValue("seen");
  mockWrite.mockRejectedValueOnce(new Error("銀行の履歴を保存できません"));
  mockPath = "/bank-adult";
  const view = render(<Session><Probe /></Session>);
  fireEvent.press(screen.getByText("この機能を見直す"));
  expect(await screen.findByText("表示履歴の保存を再試行")).toBeTruthy();

  mockPath = "/tasks-adult";
  view.rerender(<Session><Probe /></Session>);
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
  expect(screen.queryByText("表示履歴を保存できませんでした。次回も案内が表示される場合があります。")).toBeNull();
  const beforeRetry = mockWrite.mock.calls.length;
  act(() => currentTutorial.retrySave());
  expect(mockWrite).toHaveBeenCalledTimes(beforeRetry);

  mockWrite.mockRejectedValueOnce(new Error("タスクの履歴を保存できません"));
  fireEvent.press(screen.getByText("この機能を見直す"));
  expect(await screen.findByText("表示履歴の保存を再試行")).toBeTruthy();
  const beforeTaskRetry = mockWrite.mock.calls.length;
  fireEvent.press(screen.getByText("表示履歴の保存を再試行"));
  await act(async () => undefined);
  expect(mockWrite.mock.calls.slice(beforeTaskRetry)).toEqual([[featureStorageKey("a", "parent", "tasks"), "seen"]]);
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();

  mockPath = "/bank-adult";
  view.rerender(<Session><Probe /></Session>);
  expect(screen.getByText("表示履歴の保存を再試行")).toBeTruthy();
  const beforeBankRetry = mockWrite.mock.calls.length;
  fireEvent.press(screen.getByText("表示履歴の保存を再試行"));
  await act(async () => undefined);
  expect(mockWrite.mock.calls.slice(beforeBankRetry)).toEqual([[featureStorageKey("a", "parent", "bank"), "seen"]]);
  expect(screen.queryByText("表示履歴の保存を再試行")).toBeNull();
});

test("案内と無関係な再描画ではContextを保ち、進捗変更でも操作関数を保つ", async () => {
  const values: TutorialContextValue[] = [];
  const operations = jest.fn();
  function Probe() {
    const value = useTutorial();
    useEffect(() => { values.push(value); }, [value]);
    useEffect(() => { operations(); }, [value.home, value.start, value.stop, value.advance, value.retrySave]);
    return null;
  }
  mockPath = "/tasks-adult";
  const view = render(<Session><Probe /></Session>);
  await act(async () => undefined);
  const count = values.length;
  view.rerender(<Session><Probe /></Session>);
  expect(values).toHaveLength(count);
  fireEvent.press(screen.getByText("案内をはじめる"));
  fireEvent.press(screen.getByText("デイリー"));
  close();
  expect(operations).toHaveBeenCalledTimes(1);
});

test("未ログインや対象外画面では案内を提示しない", async () => {
  const view = render(<Session userId={null} />);
  await act(async () => undefined);
  expect(mockRead).not.toHaveBeenCalled();
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
  mockPath = "/login";
  view.rerender(<Session />);
  await act(async () => undefined);
  expect(screen.queryByTestId("tutorial-offer")).toBeNull();
});

test("対象の計測と移動許可は現在の手順・利用者だけに限定する", async () => {
  let tutorial: TutorialContextValue;
  function Probe() { tutorial = useTutorial(); return null; }
  const view = render(<Session><Probe /></Session>);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  const action = { type: "REPLACE", payload: { name: "settings-adult" } };
  expect(tutorial.canNavigateAction(action)).toBe(false);
  next();
  const target = { id: "parent-settings", rect: { x: 10, y: 20, width: 40, height: 40 } };
  act(() => tutorial.registerTarget(target));
  expect(tutorial.target).toEqual(target);
  act(() => tutorial.registerTarget({ ...target, id: "parent-daily" }));
  expect(tutorial.target).toEqual(target);
  tutorial.navigate("/settings-adult", () => {
    expect(tutorial.canNavigateAction(action)).toBe(true);
    expect(tutorial.canNavigateAction({ type: "GO_BACK" })).toBe(false);
    expect(tutorial.canNavigateAction({ payload: { name: "tasks-adult" } })).toBe(false);
  });
  fireEvent.press(screen.getByText("設定を開く"));
  expect(tutorial.target).toBeNull();
  view.rerender(<Session userId="b"><Probe /></Session>);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(tutorial.target).toBeNull();
  expect(tutorial.canNavigateAction(action)).toBe(false);
});

test.each(["parent", "child"] as const)("%sの履歴案内は専用画面で始まり、見直しも同じ画面へ戻る", async (role) => {
  const path = role === "parent" ? "/history-adult" : "/history-child";
  mockPath = path;
  render(<Session role={role} />);
  fireEvent.press(await screen.findByText(role === "parent" ? "案内をはじめる" : "はじめる"));
  expect(step()).toBe(role === "parent" ? "parent-history-period" : "child-history-summary");
  fireEvent.press(screen.getByText(role === "parent" ? "はじめから案内" : "はじめから"));
  expect(mockDismissTo).not.toHaveBeenCalled();
});

test("ホーム未訪問で他の機能を見直しても、初回ホーム案内を閉じた扱いにしない", async () => {
  mockPath = "/settings-adult";
  const view = render(<Session />);
  await act(async () => undefined);
  close();
  fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  fireEvent.press(screen.getByRole("button", { name: "銀行の案内を見る" }));
  mockPath = "/main-adult";
  view.rerender(<Session />);
  expect(screen.getByTestId("tutorial-offer")).toBeTruthy();
});

test.each(["parent", "child"] as const)("%sの銀行・掲示板の案内は専用画面で開始する", async (role) => {
  const suffix = role === "parent" ? "adult" : "child";
  mockPath = `/bank-${suffix}`;
  const view = render(<Session role={role} />);
  fireEvent.press(await screen.findByText(role === "parent" ? "案内をはじめる" : "はじめる"));
  expect(step()).toBe(`${role}-bank-summary`);
  mockPath = `/notifications-${suffix}`;
  view.rerender(<Session role={role} />);
  fireEvent.press(screen.getByText(role === "parent" ? "案内をはじめる" : "はじめる"));
  expect(step()).toBe(`${role}-board-summary`);
});

test("子供の見直しは効果音を鳴らし、ふりがなを除いた名前で読み上げる", async () => {
  mockRead.mockResolvedValue("seen");
  mockPath = "/settings-child";
  render(<Session role="child" />);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "使い方をもう一度見る" }));
  expect(mockSound).toHaveBeenCalledWith("confirm");
  fireEvent.press(screen.getByRole("button", { name: "銀行の案内を見る" }));
  expect(mockSound).toHaveBeenCalledTimes(2);
  expect(mockDismissTo).toHaveBeenCalledWith("/bank-child");
});

test("案内中は画面読み上げでも背景の画面へ移らず、閉じると戻る", async () => {
  useAppStore.setState({ user: { id: "a", role: "parent" } as any });
  render(<TutorialSession><TutorialHome /><Pressable accessibilityRole="button" onPress={mockAction}><Text>背景のボタン</Text></Pressable></TutorialSession>);
  fireEvent.press(await screen.findByText("案内をはじめる"));
  expect(screen.queryByRole("button", { name: "背景のボタン" })).toBeNull();
  expect(screen.getByRole("button", { name: "次へ" })).toBeTruthy();
  close();
  expect(screen.getByRole("button", { name: "背景のボタン" })).toBeTruthy();
});
