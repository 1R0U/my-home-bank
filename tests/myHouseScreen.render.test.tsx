// 自分の家の中の画面（Issue #386）のテスト。
// 3Dの部屋そのもの（描き方・歩き方）は tests/houseRoom.test.mjs / houseRoomBridge.test.mjs で確かめる。
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

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

// スティック（WebVirtualPad）は、ドラッグの代わりに入力を直接渡せるよう差し替える
let mockStickInput: ((x: number, z: number, direction: string | null) => void) | null = null;
jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  MAX_STEP: 0.18,
  WebVirtualPad: ({ children, onInputChange }: { children: unknown; onInputChange: typeof mockStickInput }) => {
    mockStickInput = onInputChange;
    return children;
  },
}));

import MyHouseScreen from "../components/MyHouseScreen";

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
  mockCanGoBack.mockReturnValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

test("準備ができたら、1階を玄関の扉の前から映す", async () => {
  await renderReadyHouse();

  expect(screen.getByText("自分の家")).toBeTruthy();
  expect(sentIntents()).toContainEqual({ floor: "ground", standX: 0.08, type: "setFloor" });
});

test("機能のある家具には、WebView が測った位置に名札を出す（押すものではない）", async () => {
  await renderReadyHouse();
  send({ event: "tags", floor: "ground", tags: [{ id: "closet", x: 120, y: 60 }] });

  expect(screen.getByLabelText("クローゼット（きがえ）")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "クローゼット（きがえ）" })).toBeNull();
});

test("スティックの左右の倒し具合を、-1〜1にして WebView へ渡す", async () => {
  await renderReadyHouse();

  act(() => mockStickInput?.(0.18, 0, "right"));
  act(() => mockStickInput?.(-0.09, 0.05, "left"));
  act(() => mockStickInput?.(0, 0, null));

  const moves = sentIntents().filter((intent) => intent.type === "move");
  expect(moves).toEqual([
    { dx: 1, type: "move" },
    { dx: -0.5, type: "move" },
    { dx: 0, type: "move" },
  ]);
});

test("部屋がまだ映っていないうちは、スティックの入力を送らない", async () => {
  await renderHouse();

  act(() => mockStickInput?.(0.18, 0, "right"));

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
  send({ event: "nearby", floor: "ground", furnitureId: "sofa" });

  fireEvent.press(screen.getByRole("button", { name: "ソファを しらべる" }));
  expect(screen.getByText("ふかふか〜")).toBeTruthy();

  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.queryByText("ふかふか〜")).toBeNull();
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

test("iPhone で右へ歩かせても町へ戻らないよう、戻るスワイプは画面の左端からだけにする", async () => {
  await renderHouse();

  const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
  expect(lastProps?.options).toEqual(expect.objectContaining({ fullScreenGestureEnabled: false }));
});
