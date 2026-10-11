// 読み込み中の画面（Issue #261）のテスト。
// 自分のキャラクターが歩く姿と、我が家タウンから建物へ入るときに重ねて出す画面を確かめる。
import { act, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

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
import { WALK_FRAME_INTERVAL_MS } from "../components/WalkingCharacter";
import { WALK_FRAME_COUNT, getPortraitKey, getWalkFramesKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { TRAVEL_MAX_MS, TRAVEL_MIN_MS } from "../lib/travelLoading";
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
/** 読み込みが終わったときの見た目 */
const LOOK: PortraitLook = { characterType: "cat", equipment: {}, palette: {}, season: "autumn" };

const user = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id: USER_A,
  name: "たろう",
  role: "child" as const,
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
  mockFetchCharacterType.mockResolvedValue("cat");
  mockFetchCharacterPalette.mockResolvedValue({});
  mockFetchOwnedItems.mockResolvedValue([]);
  mockFetchEquippedItems.mockResolvedValue([]);
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

  test("残したコマ絵が無ければ、読み込みの終わった見た目で歩く姿を描くよう頼み、描けたら歩かせる", async () => {
    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(lastRequest().variant).toBe("walk");
    expect(lastRequest().look).toEqual(LOOK);
    // 描き終わるまでは代わりの人型アイコンを出す
    expect(screen.getByTestId("walking-character-icon")).toBeTruthy();

    jest.useFakeTimers();
    await act(async () => lastRequest().onRendered(getWalkFramesKey(LOOK), FRAMES));

    expect(shownFrame()).toBe(FRAMES[0]);
    // 次に開いたときすぐ出せるよう、ファイルにも残す
    expect(mockSaveWalkFrames).toHaveBeenCalledWith({ frames: FRAMES, key: getWalkFramesKey(LOOK) });
    // 描き終わったら、3Dを描く WebView は外す
    expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();

    // コマを順に切り替えて歩かせ、1周したら最初に戻る
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS));
    expect(shownFrame()).toBe(FRAMES[1]);
    act(() => jest.advanceTimersByTime(WALK_FRAME_INTERVAL_MS * (WALK_FRAME_COUNT - 1)));
    expect(shownFrame()).toBe(FRAMES[0]);
  });

  test("ファイルに同じ見た目のコマ絵が残っていれば、描かずにそれを使う", async () => {
    mockLoadWalkFrames.mockResolvedValue({ frames: FRAMES, key: getWalkFramesKey(LOOK) });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(shownFrame()).toBe(FRAMES[0]);
    expect(mockRendererProps).toHaveLength(0);
  });

  test("ファイルに残っていたのが前の見た目なら、今の見た目で描き直す", async () => {
    mockLoadWalkFrames.mockResolvedValue({
      frames: FRAMES,
      key: getWalkFramesKey({ ...LOOK, characterType: "hamster" }),
    });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.queryByTestId("walking-character-frame")).toBeNull();
    expect(lastRequest().look).toEqual(LOOK);
  });

  test("描いている間に見た目が変わっていたら、前の見た目のコマ絵は使わない", async () => {
    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    const stale = lastRequest();
    await act(async () => stale.onRendered(getWalkFramesKey({ ...LOOK, season: "winter" }), FRAMES));

    expect(screen.queryByTestId("walking-character-frame")).toBeNull();
    expect(mockSaveWalkFrames).not.toHaveBeenCalled();
  });

  test("描けるまでは、ホームのアイコンと同じ肖像があればそれを代わりに出す", async () => {
    usePortraitStore.setState({ images: { [getPortraitKey(LOOK)]: PNG } });

    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    expect(screen.getByTestId("walking-character-portrait").props.source).toEqual({ uri: PNG });
  });

  test("描くのに失敗したら、代わりの姿のまま描き直しを頼み続けない", async () => {
    render(<TravelLoadingScreen />);
    await act(async () => undefined);

    await act(async () => lastRequest().onError?.("WebGL が使えません"));

    expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();
    expect(screen.getByTestId("walking-character-icon")).toBeTruthy();
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

    act(() => jest.advanceTimersByTime(TRAVEL_MAX_MS));
    expect(overlay.queryByTestId("travel-loading-screen")).toBeNull();
  });

  test("移動を始める前から開いていた画面の知らせでは、待ちも閉じもしない", async () => {
    jest.useFakeTimers();
    // 大人のタブのように、裏で開いたままの画面
    render(<Destination isReady={false} />);
    const overlay = render(<TravelLoadingOverlay />);
    act(() => jest.advanceTimersByTime(10));
    act(() => useTravelStore.getState().startTravel());

    expect(useTravelStore.getState().travel?.waiting).toBe(false);
  });
});
