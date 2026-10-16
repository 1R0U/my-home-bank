// 自分の家の中の画面（Issue #386）のテスト。
// 3Dの部屋そのもの（描き方・歩き方）は tests/houseRoom.test.mjs / houseRoomBridge.test.mjs で確かめる。
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockStackScreen = jest.fn<(props: { options?: Record<string, unknown> }) => null>(() => null);
jest.mock("expo-router", () => ({
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  useFocusEffect: jest.fn(),
  useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack, push: mockPush, replace: mockReplace }),
}));

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: jest.fn(() => Promise.resolve({})),
  fetchCharacterType: jest.fn(() => Promise.resolve("frog")),
  savePaletteChanges: jest.fn(),
  saveCharacterType: jest.fn(),
}));
jest.mock("../lib/wardrobeService", () => ({
  fetchEquippedItems: jest.fn(() => Promise.resolve([])),
  fetchOwnedItems: jest.fn(() => Promise.resolve([])),
  saveEquippedItem: jest.fn(),
}));

// 渡された props（onMessage）を取り出せる WebView に差し替える
type WebViewProps = {
  onLoadStart?: () => void;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
};
let mockWebViewProps: WebViewProps = {};
const mockPostMessage = jest.fn();
jest.mock("react-native-webview", () => {
  const React = require("react");
  const WebView = React.forwardRef((props: WebViewProps, ref: unknown) => {
    mockWebViewProps = props;
    React.useImperativeHandle(ref, () => ({ postMessage: mockPostMessage }));
    return null;
  });
  return { WebView, default: WebView };
});
jest.mock("expo-file-system", () => ({
  File: class {
    exists = false;
    uri = "file:///cache/rpg-hub-house-room.html";
    create() {}
    delete() {}
    write() {}
  },
  Paths: { cache: "file:///cache" },
}));
jest.mock("../components/rpg-hub-web/assetText", () => ({
  readAssetText: () => Promise.resolve(""),
}));

// 家の中の配置（もようがえ）は端末の中に保存する。保存した中身を確かめられるよう、入れ物ごと差し替える。
// null は「まだ保存していない」。テストは家具を何も置いていない部屋から始める（beforeEach）
const EMPTY_LAYOUT = { closetX: 0.27, placed: [] };
let mockStoredLayout: unknown = null;
const mockSaveHouseLayout = jest.fn((_ownerKey: string, layout: unknown) => {
  mockStoredLayout = layout;
  return Promise.resolve();
});
jest.mock("../lib/houseLayoutStorage", () => {
  const { DEFAULT_HOUSE_LAYOUT, parseHouseLayout } = jest.requireActual("../lib/rpg-hub/houseLayout") as typeof import("../lib/rpg-hub/houseLayout");
  return {
    loadHouseLayout: () => Promise.resolve(mockStoredLayout ? parseHouseLayout(mockStoredLayout) : DEFAULT_HOUSE_LAYOUT),
    saveHouseLayout: (ownerKey: string, layout: unknown) => mockSaveHouseLayout(ownerKey, layout),
  };
});

// スティック（WebVirtualPad）は、ドラッグの代わりに入力を直接渡せるよう差し替える
let mockStickInput: ((x: number, z: number, direction: string | null, screenX: number) => void) | null = null;
let mockStickDisabled = false;
jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  MAX_STEP: 0.18,
  WebVirtualPad: ({
    children,
    disabled,
    onInputChange,
  }: {
    children: unknown;
    disabled?: boolean;
    onInputChange: typeof mockStickInput;
  }) => {
    mockStickInput = onInputChange;
    mockStickDisabled = !!disabled;
    return children;
  },
}));

import MyHouseScreen from "../components/MyHouseScreen";
import { HouseRoomView } from "../components/rpg-hub-web/HouseRoomView";
import { DEFAULT_HOUSE_LAYOUT } from "../lib/rpg-hub/houseLayout";
import { useTravelStore } from "../store/travelStore";

/** WebView からイベントを送る */
const send = (event: object) =>
  act(() => mockWebViewProps.onMessage?.({ nativeEvent: { data: JSON.stringify(event) } }));

/** WebView へ送った意図の一覧 */
const sentIntents = () => mockPostMessage.mock.calls.map((call) => JSON.parse(call[0] as string));

/** 画面を描き、HTML の用意を待つ */
async function renderHouse() {
  render(<MyHouseScreen />);
  await act(async () => undefined);
}

/** 部屋の準備ができた状態にする */
async function renderReadyHouse() {
  await renderHouse();
  send({ event: "ready" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockWebViewProps = {};
  mockStoredLayout = EMPTY_LAYOUT;
  mockCanGoBack.mockReturnValue(true);
  useTravelStore.setState({ travel: null });
});

afterEach(() => {
  jest.useRealTimers();
});

test("準備ができたら、1階を玄関の扉の前から映す", async () => {
  await renderReadyHouse();

  expect(screen.getByText("自分の家")).toBeTruthy();
  expect(sentIntents()).toContainEqual({ floor: "ground", standX: 0.08, type: "setFloor" });
});

test("機能のある家具には、WebView が測った位置に名札を出す", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "closet", x: 120, y: 60 }] });

  expect(screen.getByRole("button", { name: "クローゼット（きがえ）" })).toBeTruthy();
});

test("名札をタップすると、その家具の前まで歩き、着いてから使う（Issue #422）", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "closet", x: 120, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: "クローゼット（きがえ）" }));
  expect(sentIntents()).toContainEqual({ furnitureId: "closet", type: "walkTo" });
  // 着くまでは、まだ使わない
  expect(mockPush).not.toHaveBeenCalled();

  send({ event: "arrived", floor: "ground", furnitureId: "closet" });
  expect(mockPush).toHaveBeenCalledWith("/wardrobe");
});

test("名札をタップして階段まで歩くと、着いてから別の階へ行く（Issue #422）", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "stairs-up", x: 300, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: /2かいへ）$/ }));
  send({ event: "arrived", floor: "ground", furnitureId: "stairs-up" });

  expect(screen.getByText("自分の家（2階）")).toBeTruthy();
});

test("名札をタップしたあとスティックを動かしたら、着いても使わない（Issue #422）", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "door", x: 20, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: /そとへ）$/ }));
  act(() => mockStickInput?.(0.13, -0.13, "right", 1));
  send({ event: "arrived", floor: "ground", furnitureId: "door" });

  expect(mockBack).not.toHaveBeenCalled();
});

test("名札をタップして向かう途中で、近くの家具のボタンを使ったら、着いた先の家具は使わない", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "stairs-up", x: 300, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: /2かいへ）$/ }));
  send({ event: "nearby", floor: "ground", furnitureId: "window" });
  fireEvent.press(screen.getByRole("button", { name: "まどを しらべる" }));
  // WebView 側にも、向かうのをやめさせる
  expect(sentIntents()).toContainEqual({ type: "stopWalk" });

  send({ event: "arrived", floor: "ground", furnitureId: "stairs-up" });
  expect(screen.queryByText("自分の家（2階）")).toBeNull();
});

test("名札をタップして向かう途中で、もようがえを始めたら取りやめ、着いても使わない", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "closet", x: 120, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: "クローゼット（きがえ）" }));
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  expect(sentIntents()).toContainEqual({ type: "stopWalk" });

  fireEvent.press(screen.getByRole("button", { name: "もようがえを おわる" }));
  send({ event: "arrived", floor: "ground", furnitureId: "closet" });
  expect(mockPush).not.toHaveBeenCalled();
});

test("部屋がまだ映っていないうちは、名札をタップしても向かったことにしない", async () => {
  await renderHouse();
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [{ id: "door", x: 20, y: 60 }] });

  fireEvent.press(screen.getByRole("button", { name: /そとへ）$/ }));
  expect(sentIntents().filter((intent) => intent.type === "walkTo")).toEqual([]);

  // あとで準備ができて、たまたま扉に着いた知らせが届いても、外へは出ない
  send({ event: "ready" });
  send({ event: "arrived", floor: "ground", furnitureId: "door" });
  expect(mockBack).not.toHaveBeenCalled();
});

test("タップしていない家具に着いた知らせでは、何もしない（Issue #422）", async () => {
  await renderReadyHouse();

  send({ event: "arrived", floor: "ground", furnitureId: "door" });

  expect(mockBack).not.toHaveBeenCalled();
});

test("スティックの画面上の左右の倒し具合を、-1〜1にして WebView へ渡す", async () => {
  await renderReadyHouse();

  act(() => mockStickInput?.(0.13, -0.13, "right", 1));
  act(() => mockStickInput?.(-0.06, 0.06, "left", -0.5));
  act(() => mockStickInput?.(0, 0, null, 0));

  const moves = sentIntents().filter((intent) => intent.type === "move");
  expect(moves).toEqual([
    { dx: 1, type: "move" },
    { dx: -0.5, type: "move" },
    { dx: 0, type: "move" },
  ]);
});

test("スティックを上下に倒しても、家の中では歩かない（Issue #422）", async () => {
  await renderReadyHouse();

  // 町向けに回した移動量には左右の成分があっても、上下に倒したときは歩かせない
  act(() => mockStickInput?.(-0.13, -0.13, "up", 0));
  act(() => mockStickInput?.(0.13, 0.13, "down", 0.2));

  const moves = sentIntents().filter((intent) => intent.type === "move");
  expect(moves).toEqual([
    { dx: 0, type: "move" },
    { dx: 0, type: "move" },
  ]);
});

test("部屋がまだ映っていないうちは、スティックの入力を送らない", async () => {
  await renderHouse();

  act(() => mockStickInput?.(0.18, 0, "right", 1));

  expect(sentIntents().filter((intent) => intent.type === "move")).toEqual([]);
});

test("家具に近づくとボタンが出て、離れると消える", async () => {
  await renderReadyHouse();
  expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();

  send({ event: "nearby", floor: "ground", furnitureId: "closet" });
  expect(screen.getByRole("button", { name: "きがえる" })).toBeTruthy();

  send({ event: "nearby", floor: "ground", furnitureId: null });
  expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();
});

test("クローゼットに近づいて出たボタンを押すと、きがえ画面を開く", async () => {
  await renderReadyHouse();
  send({ event: "nearby", floor: "ground", furnitureId: "closet" });

  fireEvent.press(screen.getByRole("button", { name: "きがえる" }));
  fireEvent.press(screen.getByRole("button", { name: "きがえる" }));

  // 連打しても1回だけ
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/wardrobe");
});

test("階段で2階へ行き、また1階へ戻れる。着いた階では階段の前に立つ", async () => {
  await renderReadyHouse();

  send({ event: "nearby", floor: "ground", furnitureId: "stairs-up" });
  fireEvent.press(screen.getByRole("button", { name: "2かいへ いく" }));
  expect(screen.getByText("自分の家（2階）")).toBeTruthy();
  expect(sentIntents()).toContainEqual({ floor: "upstairs", standX: 0.12, type: "setFloor" });
  // 1階の階段のボタンは、2階では出さない
  expect(screen.queryByRole("button", { name: "2かいへ いく" })).toBeNull();

  send({ event: "nearby", floor: "upstairs", furnitureId: "stairs-down" });
  fireEvent.press(screen.getByRole("button", { name: "1かいへ いく" }));
  expect(screen.getByText("自分の家")).toBeTruthy();
  expect(sentIntents()).toContainEqual({ floor: "ground", standX: 0.87, type: "setFloor" });
});

test("階を切り替えた直後に届いた、前の階の近くの家具の知らせは使わない", async () => {
  await renderReadyHouse();
  send({ event: "nearby", floor: "ground", furnitureId: "stairs-up" });
  fireEvent.press(screen.getByRole("button", { name: "2かいへ いく" }));

  send({ event: "nearby", floor: "ground", furnitureId: "closet" });

  expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();
});

test("扉に近づいて「そとへ でる」を押すと、町へ戻る", async () => {
  await renderReadyHouse();
  send({ event: "nearby", floor: "ground", furnitureId: "door" });

  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("家の紹介は玄関を囲み、家具を調べても進まず外へ出たときに進む", async () => {
  const tutorial: TutorialContextValue = {
    role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child.find((step) => step.id === "child-house-back"),
    storageError: false, home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn(),
  };
  render(<TutorialContext.Provider value={tutorial}><MyHouseScreen /></TutorialContext.Provider>);
  await act(async () => undefined);
  send({ event: "ready" });
  send({ event: "nearby", floor: "ground", furnitureId: "window" });
  expect(screen.queryByTestId("tutorial-frame-child-house-back")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "まどを しらべる" }));
  expect(tutorial.advance).not.toHaveBeenCalled();
  send({ event: "nearby", floor: "ground", furnitureId: "door" });
  expect(screen.getByTestId("tutorial-frame-child-house-back")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(tutorial.advance).toHaveBeenCalledWith("child-house-back");
});

test("戻る先が無いとき（直接開いたとき）は、町を開く", async () => {
  mockCanGoBack.mockReturnValue(false);
  await renderReadyHouse();
  send({ event: "nearby", floor: "ground", furnitureId: "door" });

  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

  expect(mockReplace).toHaveBeenCalledWith("/rpg-hub");
});

test("ひとこと話す家具をしらべると、ひとことが出て、しばらくすると案内に戻る", async () => {
  await renderReadyHouse();
  jest.useFakeTimers();
  send({ event: "nearby", floor: "ground", furnitureId: "window" });

  fireEvent.press(screen.getByRole("button", { name: "まどを しらべる" }));
  expect(screen.getByText("おそとが よくみえるね")).toBeTruthy();

  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.queryByText("おそとが よくみえるね")).toBeNull();
  expect(screen.getByText("スティックで あるいて、かぐに ちかづこう")).toBeTruthy();
});

test("部屋を表示できなかったときは知らせ、代わりのボタンで外へ出たり着替えたりできる", async () => {
  await renderHouse();
  send({ event: "error", message: "WebGL が使えません" });

  expect(screen.getByText(/おへやを ひょうじできませんでした/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "きがえる" }));
  expect(mockPush).toHaveBeenCalledWith("/wardrobe");
});

test("部屋を表示できなかったときの「そとへ でる」で、町へ戻る", async () => {
  await renderHouse();
  send({ event: "error", message: "WebGL が使えません" });

  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("準備のあとでも、キャラクターや部屋を作れなかったときは代わりのボタンへ切り替える", async () => {
  await renderReadyHouse();
  send({ event: "error", fatal: true, message: "キャラクターを作れません" });

  expect(screen.getByText(/おへやを ひょうじできませんでした/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("準備のあとの、使い続けられる失敗では、部屋を映したままにする", async () => {
  await renderReadyHouse();
  send({ event: "error", message: "着替えた姿を作れません" });

  expect(screen.queryByText(/おへやを ひょうじできませんでした/)).toBeNull();
});

test("町から入ってきたときは、部屋が映るまで「いどうちゅう」の画面に読み込み中だと知らせる（Issue #261）", async () => {
  act(() => {
    useTravelStore.getState().startTravel();
  });
  await renderHouse();
  expect(useTravelStore.getState().travel?.waiting).toBe(true);

  // ready の時点では、部屋も姿もまだ送っていないので映っていない（PR #421 CodeRabbitレビュー対応）
  send({ event: "ready" });
  expect(sentIntents()).toContainEqual(expect.objectContaining({ type: "setLook" }));
  expect(useTravelStore.getState().travel?.waiting).toBe(true);

  // 階を作って描き終わったところで届く名札の位置を、映った合図にする
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [] });
  expect(useTravelStore.getState().travel?.waiting).toBe(false);
});

/** 部屋の部品（HouseRoomView）だけを描くときの props。映ったことの知らせ（onShown）を確かめる */
const roomViewProps = (onShown: () => void) => ({
  active: true,
  editing: false,
  floor: "ground" as const,
  layout: DEFAULT_HOUSE_LAYOUT,
  onArrived: jest.fn(),
  onCharacterTapped: jest.fn(),
  onFailed: jest.fn(),
  onFurnitureDropped: jest.fn(),
  onFurnitureMoved: jest.fn(),
  onFurnitureSelected: jest.fn(),
  onFurnitureThumbnail: jest.fn(),
  onNearbyChange: jest.fn(),
  onShown,
  onTagPressed: jest.fn(),
  standX: 0.08,
});

/** 読み込み済みの姿 */
const LOADED_LOOK = { characterType: "frog" as const, equipment: {}, palette: {}, season: "spring" as const };

test("WebView を作り直したときは、作り直す前の名札の位置を映った合図にしない", async () => {
  const onShown = jest.fn();
  render(<HouseRoomView {...roomViewProps(onShown)} look={LOADED_LOOK} />);
  await act(async () => undefined);
  send({ event: "ready" });
  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [] });
  expect(onShown).toHaveBeenCalledTimes(1);

  // 作り直した WebView の ready。前の名札はまだ残っている
  send({ event: "ready" });
  expect(onShown).toHaveBeenCalledTimes(1);

  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [] });
  expect(onShown).toHaveBeenCalledTimes(2);
});

test("姿の読み込みが部屋より遅れたときは、姿が描かれてから映ったと知らせる", async () => {
  const onShown = jest.fn();
  const props = roomViewProps(onShown);
  const view = render(<HouseRoomView {...props} look={null} />);
  await act(async () => undefined);
  send({ event: "ready" });
  // 部屋だけが映った描画の名札
  send({ event: "tags", floor: "ground", hasCharacter: false, tags: [] });
  expect(onShown).not.toHaveBeenCalled();

  // 姿を送っただけでは、まだ描かれていない（PR #421 CodeRabbitレビュー対応）
  view.rerender(<HouseRoomView {...props} look={LOADED_LOOK} />);
  expect(onShown).not.toHaveBeenCalled();

  send({ event: "tags", floor: "ground", hasCharacter: true, tags: [] });
  expect(onShown).toHaveBeenCalledTimes(1);
});

test("部屋を表示できなかったときは、代わりのボタンを見せるため「いどうちゅう」の画面を閉じてよいと知らせる", async () => {
  act(() => {
    useTravelStore.getState().startTravel();
  });
  await renderHouse();

  send({ event: "error", message: "WebGL が使えません" });

  expect(useTravelStore.getState().travel?.waiting).toBe(false);
});

test("iPhone で右へ歩かせても町へ戻らないよう、戻るスワイプは画面の左端からだけにする", async () => {
  await renderHouse();

  const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
  expect(lastProps?.options).toEqual(expect.objectContaining({ fullScreenGestureEnabled: false }));
});

// --- もようがえ（Issue #425） ---

test("まだ配置を保存していなければ、もようがえを入れる前と同じ家具が置いてある部屋を送る（1R0Uレビュー指摘）", async () => {
  mockStoredLayout = null;
  await renderReadyHouse();

  const layout = sentIntents().find((intent) => intent.type === "setLayout")?.layout;
  expect(layout.placed.map((item: { kind: string }) => item.kind)).toEqual(["sofa", "plant", "bed", "bookshelf", "toyBox"]);
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  expect(screen.getByText("かぐは ぜんぶ おいたよ")).toBeTruthy();
});

test("部屋を映す前に、保存してあった配置を送る", async () => {
  mockStoredLayout = { closetX: 0.3, placed: [{ floor: "ground", kind: "plant", x: 0.6 }] };
  await renderReadyHouse();

  const intents = sentIntents();
  const layoutIndex = intents.findIndex((intent) => intent.type === "setLayout");
  const floorIndex = intents.findIndex((intent) => intent.type === "setFloor");
  expect(layoutIndex).toBeGreaterThanOrEqual(0);
  expect(layoutIndex).toBeLessThan(floorIndex);
  expect(intents[layoutIndex].layout).toEqual(mockStoredLayout);
});

test("もようがえを始めると、スティックを止めて、しまってある家具を並べる。おわると元に戻る", async () => {
  await renderReadyHouse();

  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  expect(sentIntents()).toContainEqual({ editing: true, type: "setEditing" });
  expect(mockStickDisabled).toBe(true);
  expect(screen.getByText("もようがえ ちゅう")).toBeTruthy();
  expect(screen.getByRole("button", { name: "ソファを おく" })).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "もようがえを おわる" }));
  expect(sentIntents()).toContainEqual({ editing: false, type: "setEditing" });
  expect(mockStickDisabled).toBe(false);
  expect(screen.getByText("自分の家")).toBeTruthy();
});

test("もようがえ中は、家具に近づいても家具を使うボタンを出さない", async () => {
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  send({ event: "nearby", floor: "ground", furnitureId: "closet" });

  expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();
});

test("家具を置くと、配置を送り直して保存し、一覧から消える", async () => {
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  mockPostMessage.mockClear();

  fireEvent.press(screen.getByRole("button", { name: "うえきを おく" }));
  await act(async () => undefined);

  const layout = sentIntents().find((intent) => intent.type === "setLayout")?.layout;
  expect(layout.placed).toEqual([{ floor: "ground", kind: "plant", x: 0.5 }]);
  expect(mockSaveHouseLayout).toHaveBeenCalledWith(expect.any(String), layout);
  expect(screen.queryByRole("button", { name: "うえきを おく" })).toBeNull();
});

test("家具を動かし終えたら、置ける位置に直して保存する", async () => {
  mockStoredLayout = { closetX: 0.27, placed: [{ floor: "ground", kind: "plant", x: 0.5 }] };
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));

  send({ event: "furnitureMoved", floor: "ground", furnitureId: "placed-plant", x: 0.6 });
  expect(mockSaveHouseLayout).toHaveBeenLastCalledWith(expect.any(String), {
    closetX: 0.27,
    placed: [{ floor: "ground", kind: "plant", x: 0.6 }],
  });

  // クローゼットも動かせる
  send({ event: "furnitureMoved", floor: "ground", furnitureId: "closet", x: 0.4 });
  expect((mockStoredLayout as { closetX: number }).closetX).toBe(0.4);
});

test("選んだ家具はしまえる。クローゼットは選んでも、しまうボタンを出さない", async () => {
  mockStoredLayout = { closetX: 0.27, placed: [{ floor: "ground", kind: "plant", x: 0.5 }] };
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));

  send({ event: "furnitureSelected", floor: "ground", furnitureId: "closet" });
  expect(screen.queryByRole("button", { name: /しまう/ })).toBeNull();

  send({ event: "furnitureSelected", floor: "ground", furnitureId: "placed-plant" });
  fireEvent.press(screen.getByRole("button", { name: "うえきを しまう" }));
  expect(mockSaveHouseLayout).toHaveBeenLastCalledWith(expect.any(String), { closetX: 0.27, placed: [] });
  expect(screen.getByRole("button", { name: "うえきを おく" })).toBeTruthy();
});

test("部屋を映し始めたら家具の絵を頼み、届いた絵を一覧に出す。届くまでは絵文字を出す", async () => {
  await renderReadyHouse();
  expect(sentIntents()).toContainEqual({ type: "renderThumbnails" });

  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  expect(screen.queryByTestId("furniture-thumbnail")).toBeNull();
  expect(screen.getByText("🛋️")).toBeTruthy();

  send({ dataUrl: "data:image/png;base64,AAAA", event: "thumbnail", kind: "sofa" });
  expect(screen.getByTestId("furniture-thumbnail").props.source).toEqual({ uri: "data:image/png;base64,AAAA" });
  expect(screen.queryByText("🛋️")).toBeNull();
  // まだ届いていない家具は絵文字のまま
  expect(screen.getByText("🛏️")).toBeTruthy();
});

test("一覧からドラッグした家具を部屋の上で離すと、届いた位置に置いて保存する", async () => {
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));

  send({ event: "furnitureDropped", floor: "upstairs", kind: "bed", x: 0.4 });
  // 別の階への知らせ（階を切り替えた直後に届いたもの）は使わない
  expect(mockSaveHouseLayout).not.toHaveBeenCalled();

  send({ event: "furnitureDropped", floor: "ground", kind: "plant", x: 0.62 });
  expect(mockSaveHouseLayout).toHaveBeenLastCalledWith(expect.any(String), {
    closetX: 0.27,
    placed: [{ floor: "ground", kind: "plant", x: 0.62 }],
  });
  expect(screen.queryByRole("button", { name: "うえきを おく" })).toBeNull();
});

test("一覧から持ち上げた家具は指についてくるが、部屋の上では消して、部屋の中の半透明の家具だけにする", async () => {
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  const tray = screen.getByTestId("furniture-tray-sofa");
  const gesture = (moveX: number, moveY: number) => ({ dx: 0, dy: -40, moveX, moveY });

  // 部屋の枠の位置（measureInWindow）はテストでは測れないので、部屋の外を動かしているのと同じになる
  await act(async () => tray.props.onResponderGrant?.({ nativeEvent: {}, touchHistory: { touchBank: [] } }, gesture(50, 500)));
  expect(screen.queryByTestId("dragged-furniture")).toBeTruthy();
  expect(screen.getByTestId("furniture-tray-sofa").props.style).toEqual({ opacity: 0.3 });
});

test("家具を持ち上げたまま、もようがえを終えたら、持ち上げた家具を片付ける（CodeRabbitレビュー指摘）", async () => {
  await renderReadyHouse();
  fireEvent.press(screen.getByRole("button", { name: "もようがえを する" }));
  const tray = screen.getByTestId("furniture-tray-sofa");
  await act(async () =>
    tray.props.onResponderGrant?.({ nativeEvent: {}, touchHistory: { touchBank: [] } }, { dx: 0, dy: -40, moveX: 50, moveY: 500 }),
  );
  expect(screen.queryByTestId("dragged-furniture")).toBeTruthy();
  mockPostMessage.mockClear();

  fireEvent.press(screen.getByRole("button", { name: "もようがえを おわる" }));
  expect(screen.queryByTestId("dragged-furniture")).toBeNull();
  expect(sentIntents()).toContainEqual({ kind: "sofa", phase: "cancel", type: "dragFurniture", viewX: 0, viewY: 0 });
});
