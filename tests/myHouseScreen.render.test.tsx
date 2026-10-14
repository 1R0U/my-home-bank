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
let mockStickInput: ((x: number, z: number, direction: string | null, screenX: number) => void) | null = null;
jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  MAX_STEP: 0.18,
  WebVirtualPad: ({ children, onInputChange }: { children: unknown; onInputChange: typeof mockStickInput }) => {
    mockStickInput = onInputChange;
    return children;
  },
}));

import MyHouseScreen from "../components/MyHouseScreen";
import { HouseRoomView } from "../components/rpg-hub-web/HouseRoomView";
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
  send({ event: "nearby", floor: "ground", furnitureId: "sofa" });
  fireEvent.press(screen.getByRole("button", { name: "ソファを しらべる" }));
  // WebView 側にも、向かうのをやめさせる
  expect(sentIntents()).toContainEqual({ type: "stopWalk" });

  send({ event: "arrived", floor: "ground", furnitureId: "stairs-up" });
  expect(screen.queryByText("自分の家（2階）")).toBeNull();
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

test("WebView を作り直したときは、作り直す前の名札の位置を映った合図にしない", async () => {
  const onShown = jest.fn();
  render(
    <HouseRoomView
      active
      floor="ground"
      look={{ characterType: "frog", equipment: {}, palette: {}, season: "spring" }}
      onCharacterTapped={jest.fn()}
      onFailed={jest.fn()}
      onArrived={jest.fn()}
      onNearbyChange={jest.fn()}
      onTagPressed={jest.fn()}
      onShown={onShown}
      standX={0.08}
    />,
  );
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
  const props = {
    active: true,
    floor: "ground" as const,
    onCharacterTapped: jest.fn(),
    onFailed: jest.fn(),
    onArrived: jest.fn(),
    onNearbyChange: jest.fn(),
    onTagPressed: jest.fn(),
    onShown,
    standX: 0.08,
  };
  const view = render(<HouseRoomView {...props} look={null} />);
  await act(async () => undefined);
  send({ event: "ready" });
  // 部屋だけが映った描画の名札
  send({ event: "tags", floor: "ground", hasCharacter: false, tags: [] });
  expect(onShown).not.toHaveBeenCalled();

  // 姿を送っただけでは、まだ描かれていない（PR #421 CodeRabbitレビュー対応）
  view.rerender(
    <HouseRoomView {...props} look={{ characterType: "frog", equipment: {}, palette: {}, season: "spring" }} />,
  );
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
