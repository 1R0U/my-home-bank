// 読み込み中の画面（Issue #261）のテスト。
// 自分のキャラクターが歩く姿と、我が家タウンから建物へ入るときに重ねて出す画面を確かめる。
import { act, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

// 歩く姿は読み込み済みの値を読むだけで、取得しに行かない（PR #411 レビュー対応）。
// 呼ばれたら分かるよう、取得する関数を見張っておく
const mockFetchCharacterType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchCharacterPalette = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: (...args: unknown[]) => mockFetchCharacterPalette(...args),
  fetchCharacterType: (...args: unknown[]) => mockFetchCharacterType(...args),
  savePaletteChanges: jest.fn(),
  saveCharacterType: jest.fn(),
}));
const mockFetchOwnedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchEquippedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/wardrobeService", () => ({
  fetchEquippedItems: (...args: unknown[]) => mockFetchEquippedItems(...args),
  fetchOwnedItems: (...args: unknown[]) => mockFetchOwnedItems(...args),
  saveEquippedItem: jest.fn(),
}));

// ファイルに残したコマ絵の読み書きの代わり
const mockLoadWalkFrames = jest.fn<() => Promise<unknown>>();
const mockSaveWalkFrames = jest.fn<(walkFrames: unknown) => void>();
jest.mock("../lib/walkFramesFile", () => ({
  loadWalkFrames: () => mockLoadWalkFrames(),
  saveWalkFrames: (walkFrames: unknown) => mockSaveWalkFrames(walkFrames),
}));

// 3Dを描く WebView の代わり。受け取った依頼を記録し、描き終わりをテストから起こす
type RendererProps = {
  look: PortraitLook;
  onError?: (message: string) => void;
  onRendered: (key: string, frames: string[]) => void;
  variant?: string;
};
const mockRendererProps: RendererProps[] = [];
jest.mock("../components/rpg-hub-web/PortraitRenderer", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    PortraitRenderer: (props: RendererProps) => {
      mockRendererProps.push(props);
      return createElement(View, { testID: "mock-portrait-renderer" });
    },
  };
});

import TravelLoadingOverlay from "../components/TravelLoadingOverlay";
import TravelLoadingScreen from "../components/TravelLoadingScreen";
import { WALK_FRAME_INTERVAL_MS, WalkFramesPreparer } from "../components/WalkingCharacter";
import { WALK_FRAME_COUNT, getPortraitKey, getWalkFramesKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { TRAVEL_MAX_MS, TRAVEL_MIN_MS, TRAVEL_UNREPORTED_MS } from "../lib/travelLoading";
import { useTravelArrival } from "../lib/useTravelArrival";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { usePortraitStore } from "../store/portraitStore";
import { useTravelStore } from "../store/travelStore";
import { useWalkFramesStore } from "../store/walkFramesStore";
import { useWardrobeStore } from "../store/wardrobeStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const FRAMES = Array.from({ length: WALK_FRAME_COUNT }, (_, index) => `${PNG}${index}`);
/** 読み込み済みにしておく見た目 */
const LOOK: PortraitLook = { characterType: "cat", equipment: {}, palette: {}, season: "autumn" };

const user = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id: USER_A,
  name: "たろう",
  role: "child" as const,
};

/** 町の画面で、種類・色・装備の読み込みが済んだ状態にする */
const markLookLoaded = () => {
  useAppearanceStore.setState({
    characterType: "cat",
    characterTypeLoadedFor: USER_A,
    palette: {},
    paletteLoadedFor: USER_A,
    paletteLoadedCharacterType: "cat",
  });
  useWardrobeStore.setState({ equipment: {}, equipmentLoadedFor: USER_A, ownedAssetIds: [] });
};

/** @returns 最後に描くよう頼まれた依頼 */
const lastRequest = () => mockRendererProps[mockRendererProps.length - 1];

/** 見せているコマの画像 */
const shownFrame = () => screen.getByTestId("walking-character-frame").props.source.uri;

beforeEach(() => {
  jest.clearAllMocks();
  mockRendererProps.length = 0;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user });
  useAppearanceStore.setState({
    characterType: "frog",
    characterTypeLoadedFor: null,
    palette: {},
    paletteLoadedFor: null,
    paletteLoadedCharacterType: "frog",
  });
  useWardrobeStore.setState({ equipment: {}, equipmentLoadedFor: undefined, ownedAssetIds: [] });
  useMapStore.setState({ currentSeason: "autumn" });
  usePortraitStore.setState({ images: {} });
  useWalkFramesStore.setState({ walkFrames: null });
  useTravelStore.setState({ travel: null });
  mockLoadWalkFrames.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("自分のキャラクターが歩く姿", () => {
  test("「いどうちゅう」と出し、読み込み中であることを読み上げられる", async () => {
    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.getByText("いどうちゅう")).toBeTruthy();
    expect(screen.getByLabelText("いどうちゅう")).toBeTruthy();
  });

  test("覚えているコマ絵を順に切り替えて歩かせ、1周したら最初に戻る", async () => {
    markLookLoaded();
    useWalkFramesStore.setState({ walkFrames: { frames: FRAMES, key: getWalkFramesKey(LOOK) } });
    jest.useFakeTimers();

    render(<TravelLoadingScreen />);

    expect(shownFrame()).toBe(FRAMES[0]);
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS));
    expect(shownFrame()).toBe(FRAMES[1]);
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS * (WALK_FRAME_COUNT - 1)));
    expect(shownFrame()).toBe(FRAMES[0]);
  });

  test("ファイルに同じ見た目のコマ絵が残っていれば、それで歩かせる", async () => {
    markLookLoaded();
    mockLoadWalkFrames.mockResolvedValue({ frames: FRAMES, key: getWalkFramesKey(LOOK) });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(shownFrame()).toBe(FRAMES[0]);
  });

  test("コマ絵が無くても、読み込み中の画面の中では描かず、取得もしない（ほかの読み込みを遅らせないため）", async () => {
    markLookLoaded();

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.getByTestId("walking-character-icon")).toBeTruthy();
    expect(mockRendererProps).toHaveLength(0);
    expect(mockFetchCharacterType).not.toHaveBeenCalled();
    expect(mockFetchCharacterPalette).not.toHaveBeenCalled();
    expect(mockFetchOwnedItems).not.toHaveBeenCalled();
    expect(mockFetchEquippedItems).not.toHaveBeenCalled();
  });

  test("コマ絵が無いときは、ホームのアイコンと同じ肖像があればそれを代わりに出す", async () => {
    markLookLoaded();
    usePortraitStore.setState({ images: { [getPortraitKey(LOOK)]: PNG } });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.getByTestId("walking-character-portrait").props.source).toEqual({ uri: PNG });
  });

  test("選び直した姿のコマ絵がまだ無くても、選択画面で残した画像が届いたらその姿を出す", async () => {
    markLookLoaded();
    const oldLook = { ...LOOK, characterType: "frog" as const };
    useWalkFramesStore.setState({ walkFrames: { frames: FRAMES, key: getWalkFramesKey(oldLook) } });
    usePortraitStore.setState({ images: { [getPortraitKey(oldLook)]: PNG } });
    render(<TravelLoadingScreen />);
    await act(async () => undefined);
    expect(screen.getByTestId("walking-character-icon")).toBeTruthy();

    const selectedImage = `${PNG}selected`;
    act(() => { usePortraitStore.getState().setImage(getPortraitKey(LOOK), selectedImage); });

    expect(screen.queryByTestId("walking-character-icon")).toBeNull();
    expect(screen.queryByTestId("walking-character-frame")).toBeNull();
    expect(screen.getByTestId("walking-character-portrait").props.source).toEqual({ uri: selectedImage });
    expect(mockRendererProps).toHaveLength(0);
  });

  test("見た目の読み込みが済んでいなければ、前の人や途中の姿を出さず人型のアイコンにする", async () => {
    // 残っているコマ絵は、読み込みが済む前の既定の姿（カエル）のもの
    const frogLook = { ...LOOK, characterType: "frog" as const };
    useWalkFramesStore.setState({ walkFrames: { frames: FRAMES, key: getWalkFramesKey(frogLook) } });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.queryByTestId("walking-character-frame")).toBeNull();
    expect(screen.getByTestId("walking-character-icon")).toBeTruthy();
    expect(mockLoadWalkFrames).not.toHaveBeenCalled();
  });
});

describe("歩く姿を裏で描いておく（WalkFramesPreparer）", () => {
  test("ファイルにも無ければ、読み込み済みの見た目で描くよう頼み、描けたら覚えてファイルにも残す", async () => {
    markLookLoaded();
    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    expect(lastRequest().variant).toBe("walk");
    expect(lastRequest().look).toEqual(LOOK);

    await act(async () => lastRequest().onRendered(getWalkFramesKey(LOOK), FRAMES));

    const saved = { frames: FRAMES, key: getWalkFramesKey(LOOK) };
    expect(useWalkFramesStore.getState().walkFrames).toEqual(saved);
    expect(mockSaveWalkFrames).toHaveBeenCalledWith(saved);
    // 描き終わったら、3Dを描く WebView は外す
    expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();
  });

  test("ファイルに同じ見た目のコマ絵が残っていれば、描かない", async () => {
    markLookLoaded();
    mockLoadWalkFrames.mockResolvedValue({ frames: FRAMES, key: getWalkFramesKey(LOOK) });

    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    expect(mockRendererProps).toHaveLength(0);
    expect(useWalkFramesStore.getState().walkFrames?.key).toBe(getWalkFramesKey(LOOK));
  });

  test("ファイルに残っていたのが前の見た目なら、今の見た目で描き直す", async () => {
    markLookLoaded();
    mockLoadWalkFrames.mockResolvedValue({
      frames: FRAMES,
      key: getWalkFramesKey({ ...LOOK, characterType: "hamster" }),
    });

    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    expect(lastRequest().look).toEqual(LOOK);
  });

  test("描いている間に見た目が変わっていたら、前の見た目のコマ絵は使わない", async () => {
    markLookLoaded();
    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    await act(async () => lastRequest().onRendered(getWalkFramesKey({ ...LOOK, season: "winter" }), FRAMES));

    expect(useWalkFramesStore.getState().walkFrames).toBeNull();
    expect(mockSaveWalkFrames).not.toHaveBeenCalled();
  });

  test("描くのに失敗したら、描き直しを頼み続けない", async () => {
    markLookLoaded();
    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    await act(async () => lastRequest().onError?.("WebGL が使えません"));

    expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();
  });

  test("見た目の読み込みが済むまでは描かない", async () => {
    render(<WalkFramesPreparer />);
    await act(async () => undefined);

    expect(mockRendererProps).toHaveLength(0);
  });
});

/** 建物の画面の代わり。読み込みの具合を知らせる */
function Destination({ isReady }: { isReady: boolean }) {
  useTravelArrival(isReady);
  return null;
}

describe("我が家タウンから建物へ入るとき", () => {
  test("移動していなければ何も出さない", () => {
    const overlay = render(<TravelLoadingOverlay />);
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("移動していない間も、コマ絵を読み込んでおくため見えないように置き、触れさせず歩かせない", () => {
    // 移動のたびに作ると、コマ絵の読み込みが間に合わず文字だけが先に出ることがあった
    markLookLoaded();
    useWalkFramesStore.setState({ walkFrames: { frames: FRAMES, key: getWalkFramesKey(LOOK) } });
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);

    // 読み上げから隠した要素は、既定では探す対象から外れる
    const hiddenOptions = { includeHiddenElements: true };
    const hidden = overlay.getByTestId("travel-loading-screen-hidden", hiddenOptions);
    expect(hidden.props.pointerEvents).toBe("none");
    expect(hidden.props.accessibilityElementsHidden).toBe(true);
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
    const hiddenFrame = () => overlay.getByTestId("walking-character-frame", hiddenOptions).props.source.uri;
    expect(hiddenFrame()).toBe(FRAMES[0]);
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS * 3));
    expect(hiddenFrame()).toBe(FRAMES[0]);

    // 移動を始めたら、その場で見せて歩かせる
    act(() => useTravelStore.getState().startTravel());
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS));
    expect(shownFrame()).toBe(FRAMES[1]);
  });

  test("入った先がすぐ用意できても、最低限の時間は出してから閉じる", async () => {
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);
    act(() => useTravelStore.getState().startTravel());
    render(<Destination isReady />);

    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();
    act(() => jest.advanceTimersByTime(TRAVEL_MIN_MS - 1));
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("入った先の画面ができるのが遅くても、知らせが届くまでは閉じない（PR #411 レビュー対応）", async () => {
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);
    act(() => useTravelStore.getState().startTravel());

    // 最低限の時間を過ぎても、まだ知らせが無いので出しておく
    act(() => jest.advanceTimersByTime(TRAVEL_MIN_MS + 100));
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();

    // 遅れてできた画面が読み込み中だと知らせたら、そのまま待ち続ける
    render(<Destination isReady={false} />);
    act(() => jest.advanceTimersByTime(TRAVEL_UNREPORTED_MS));
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();
  });

  test("どの画面からも知らせが無ければ、少し長めに待って閉じる", async () => {
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);
    act(() => useTravelStore.getState().startTravel());

    act(() => jest.advanceTimersByTime(TRAVEL_UNREPORTED_MS));
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("入った先が読み込み中の間は出し続け、読み込めたら閉じる", async () => {
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);
    act(() => useTravelStore.getState().startTravel());
    const destination = render(<Destination isReady={false} />);

    act(() => jest.advanceTimersByTime(TRAVEL_MIN_MS * 3));
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();

    destination.rerender(<Destination isReady />);
    act(() => jest.advanceTimersByTime(0));
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("読み込みが終わらなくても、最長の時間で閉じる（閉じ込めない）", async () => {
    jest.useFakeTimers();
    const overlay = render(<TravelLoadingOverlay />);
    act(() => useTravelStore.getState().startTravel());
    render(<Destination isReady={false} />);

    act(() => jest.advanceTimersByTime(TRAVEL_MAX_MS - 1));
    expect(overlay.getByTestId("travel-loading-screen")).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("移動を始める前から開いていた画面は、知らせない", async () => {
    jest.useFakeTimers();
    // 大人のタブのように、裏で開いたままの画面
    render(<Destination isReady />);
    render(<TravelLoadingOverlay />);
    act(() => jest.advanceTimersByTime(10));
    act(() => useTravelStore.getState().startTravel());

    expect(useTravelStore.getState().travel?.waiting).toBeNull();
  });
});
