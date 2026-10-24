import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockStackScreen = jest.fn<(props: { options?: Record<string, unknown> }) => null>(() => null);
const mockSendIntent = jest.fn();
const mockUseFocusEffect = jest.fn<(effect: () => void | (() => void)) => void>();
let mockIsFocused = true;
const mockStartBgm = jest.fn<() => Promise<void>>(() => Promise.resolve());
const mockStopBgm = jest.fn();
const mockReloadOwnedAssets = jest.fn<() => Promise<void>>(() => Promise.resolve());
let mockOwnedAssets: { asset_id: string; quantity: number }[] = [];
let mockOwnedLoading = false;
// 置いた装飾の書き込み（Issue #477）。置く・動かす・回す・しまうが呼ばれたかを見る
const mockPlace = jest.fn<(decoration: unknown) => Promise<void>>(() => Promise.resolve());
const mockRemove = jest.fn<(objectId: string) => Promise<void>>(() => Promise.resolve());
const mockUpdate = jest.fn<(objectId: string, change: unknown) => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/usePlacedDecorations", () => ({
  usePlacedDecorations: () => ({
    place: mockPlace,
    reload: () => Promise.resolve(),
    remove: mockRemove,
    update: mockUpdate,
  }),
}));
// 計測表示を出すか（Issue #507）。読み込み時に決まる定数なので、モックで切り替える。
// 実際の環境変数（シェルや .env の EXPO_PUBLIC_SHOW_PERF）にテストの結果が左右されないよう、既定は false
let mockShowHubPerf = false;
// （オブジェクトの展開に getter を書くと、変換後は読み込み時の値でコピーされるので defineProperty で付ける）
jest.mock("../lib/devRole", () =>
  Object.defineProperty({ ...jest.requireActual<typeof import("../lib/devRole")>("../lib/devRole") }, "SHOW_HUB_PERF", {
    get: () => mockShowHubPerf,
  }),
);
jest.mock("../lib/useOwnedStoreAssets", () => ({
  useOwnedStoreAssets: () => ({
    data: mockOwnedAssets, loading: mockOwnedLoading, error: null, reload: mockReloadOwnedAssets,
  }),
}));
// 親が子供ごとに使わないにした機能（Issue #348）。既定は何も止めない
let mockFeatureRestrictions: { user_id: string; feature: "bank" }[] = [];
// 設定を読み込めたか（false なら読み込み中、mockFeatureError があれば読み込めなかった）
let mockFeatureHasData = true;
let mockFeatureError: string | null = null;
const mockReloadFeatures = jest.fn(() => Promise.resolve());
jest.mock("../lib/useChildFeatureRestrictions", () => ({
  useChildFeatureRestrictions: () => ({
    error: mockFeatureError, hasData: mockFeatureHasData, isLive: true, loading: !mockFeatureHasData && !mockFeatureError,
    reload: mockReloadFeatures, restrictions: mockFeatureRestrictions, updateData: jest.fn(),
  }),
}));
/** WebView ラッパに渡されたコールバックを、テストから発火させるために保持する。 */
const mockHandlers: {
  onEvent?: (event: unknown) => void;
  onLoadError?: (message: string) => void;
  /** 描き直された回数。ハブ画面全体が描き直されたかを見るのに使う */
  renders: number;
  /** 実際にシーンを作り直したときの種類。props の更新だけと区別する */
  mounts: string[];
} = { mounts: [], renders: 0 };

jest.mock("expo-router", () => ({
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  useFocusEffect: (effect: () => void | (() => void)) => mockUseFocusEffect(effect),
  useIsFocused: () => mockIsFocused,
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => mockCanGoBack(),
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("../lib/audio", () => ({
  AUDIO_SOURCES: { rpgHubBgm1: 2, rpgHubBgm2: 3 },
  playSoundEffect: () => undefined,
  useTownBgm: () => ({ start: mockStartBgm, stop: mockStopBgm }),
}));

jest.mock("../components/rpg-hub-web/RpgHubWebView", () => {
  const { forwardRef, useEffect, useImperativeHandle } = require("react");
  return {
    RpgHubWebView: forwardRef((props: any, ref: any) => {
      mockHandlers.onEvent = props.onEvent;
      mockHandlers.onLoadError = props.onLoadError;
      mockHandlers.renders += 1;
      useEffect(() => { mockHandlers.mounts.push(props.characterType); }, []);
      useImperativeHandle(ref, () => ({ sendIntent: mockSendIntent }));
      return null;
    }),
  };
});

// 連続記録のお祝い（Issue #372）は tests/questStreakCelebration.render.test.tsx で確かめる
jest.mock("../components/QuestStreakCelebration", () => () => null);
// 承認のお知らせ（Issue #424）は tests/questRewardNotice.render.test.tsx で確かめる
jest.mock("../components/QuestRewardNotice", () => () => null);

// 歩くキャラクターそのもの（Issue #261）は tests/travelLoading.render.test.tsx で確かめる
jest.mock("../components/TravelLoadingScreen", () => {
  const { View } = require("react-native");
  return ({ overlay }: { overlay?: boolean }) => (
    <View testID={overlay ? "mock-travel-loading-overlay" : "mock-travel-loading-screen"} />
  );
});
jest.mock("../components/WalkingCharacter", () => {
  const { View } = require("react-native");
  return { WalkFramesPreparer: () => <View testID="mock-walk-frames-preparer" /> };
});

const mockPadProps = jest.fn();
jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  WebVirtualPad: (props: { children: React.ReactNode }) => {
    mockPadProps(props);
    return props.children;
  },
}));

const mockFetchCharacterType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchCharacterPalette = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: (...args: unknown[]) => mockFetchCharacterPalette(...args),
  fetchCharacterType: (...args: unknown[]) => mockFetchCharacterType(...args),
  saveCharacterType: jest.fn(),
  savePaletteChanges: jest.fn(),
}));

import RpgHubScreen, { SCENE_LOAD_TIMEOUT_MS } from "../components/RpgHubScreen";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement";
import { BUILDING_MAP_LABELS } from "../lib/rpg-hub/minimap";
import { buildFamilyNpcs } from "../lib/rpg-hub/familyNpcs";
import { buildFamilyHouses } from "../lib/rpg-hub/familyHouses";
import { getInteractLabel, resolveMapRoute } from "../lib/rpg-hub/routes";
import { stripFurigana } from "../lib/furigana";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog";
import { getEditArea } from "../lib/rpg-hub/editView";
import { getFurnitureRotationCenter, placeFurnitureAt } from "../lib/rpg-hub/houseFurniture";
import { HOUSE_GRID_ORIGIN, HOUSE_ROOM_CENTER } from "../lib/rpg-hub/houseInterior";
import { getObjectCells, TOWN_CELL_SIZE } from "../lib/rpg-hub/townGrid";
import { createDecorationCandidate } from "../lib/rpg-hub/placementSpot";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { useTravelStore } from "../store/travelStore";
import type { BuildingMapObject } from "../types/map";

/**
 * 大人としてログインした状態にする。
 * IDは非UUIDのまま。実データの取得（装飾・着せ替え）を走らせずにロールだけ変えるため。
 */
const loginAsParent = () =>
  useAppStore.setState({
    user: {
      balance: 0,
      created_at: "2026-07-01T00:00:00Z",
      id: "user-parent-1",
      name: "おとうさん",
      role: "parent",
    },
  });

/** WebView からのイベントを1件流す。 */
const emit = async (event: unknown) => {
  await act(() => {
    mockHandlers.onEvent?.(event);
  });
};

/**
 * 別の画面から戻ってきて、この画面にフォーカスが戻ったときの処理を流す。
 * useFocusEffect に渡された処理を、同じものは1回ずつ呼ぶ。
 */
const refocus = async () => {
  const effects = new Set(mockUseFocusEffect.mock.calls.map(([effect]) => effect));
  await act(() => {
    for (const effect of effects) effect();
  });
};

/** 送信された意図のうち、指定した type のものを集める。 */
const sentIntents = (type: string) =>
  mockSendIntent.mock.calls.map(([intent]) => intent as any).filter((intent) => intent?.type === type);

/** 復元を依頼されたWebViewが、配置を終えたことを通知する。 */
const confirmPlayerPlacement = async () => {
  const requestId = sentIntents("placePlayer").at(-1)?.requestId;
  expect(requestId).toEqual(expect.any(String));
  await emit({ event: "playerPlaced", requestId });
};

/**
 * 建物の前まで来て、出てきたボタン（「入る」など）を押す。建物は直接タップしては入れない（Issue #491）。
 * @param target - 建物の route（その route の最初の建物を使う）、または建物そのもの
 */
const enterAtDoor = async (target: string | BuildingMapObject) => {
  const building: any = typeof target === "string"
    ? useMapStore.getState().objects.find((object) => object.type === "building" && object.route === target)
    : target;
  await emit({ event: "nearby", id: building.id });
  await fireEvent.press(screen.getByRole("button", { name: stripFurigana(getInteractLabel(building.route)) }));
};

function tutorialValue(): TutorialContextValue {
  return { role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child[0], storageError: false,
    home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn() };
}

test("矢印は準備後に現れて移動で向きが変わり、入場や案内の終了で消える", async () => {
  const tutorial = tutorialValue();
  const view = await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
  await emit({ event: "ready" });
  expect(screen.getByTestId("tutorial-direction").props.pointerEvents).toBe("none");
  const initial = screen.getByTestId("tutorial-direction-arrow").props.style;
  await emit({ event: "position", x: 20, z: -10, facingY: 0, direction: "up" });
  expect(screen.getByTestId("tutorial-direction-arrow").props.style).not.toEqual(initial);
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
  await emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId("tutorial-direction-arrow").props.style).toEqual(expect.arrayContaining([
    { transform: [{ rotate: "0deg" }] },
  ]));
  await fireEvent.press(screen.getByRole("button", { name: "入る" }));
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
  await view.rerender(<TutorialContext.Provider value={{ ...tutorial, mode: "idle", step: null }}><RpgHubScreen /></TutorialContext.Provider>);
  await refocus();
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
});

test.each(["board", "history"])("%sの紹介へ入口のボタンで進め、入口の枠と目的地の矢印も表示する", async (route) => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.townRoute === route) };
  await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  await emit({ event: "ready" });
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === route);
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  await emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId(`tutorial-frame-town-${route}`)).toBeTruthy();
  await enterAtDoor(route);
  expect(mockPush).toHaveBeenCalledWith(resolveMapRoute(route as any, "child"));
  expect(tutorial.advance).toHaveBeenCalledWith(`town-${route}`);
});

test("自分の家の紹介は、家に入ると画面遷移せずに家の中へ入って進む（Issue #444）", async () => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "town-house") };
  await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  await emit({ event: "ready" });
  const house = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "house");
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  await emit({ event: "nearby", id: house.id });
  expect(screen.getByTestId("tutorial-frame-town-house")).toBeTruthy();
  await enterAtDoor("house");
  expect(mockPush).not.toHaveBeenCalled();
  expect(sentIntents("placePlayer")).toHaveLength(1);
  expect(tutorial.advance).toHaveBeenCalledWith("town-house");
});

test("家の中の紹介は玄関を矢印で示して囲み、「そとへ でる」で町へ戻ると進む（Issue #444）", async () => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "child-house-back") };
  await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  await emit({ event: "ready" });
  const objects = useMapStore.getState().objects;
  const door = objects.find((object) => object.type === "building" && object.route === "exit");
  const house = objects.find((object) => object.type === "building" && object.route === "house");
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  // クローゼットの前では囲まない
  await emit({ event: "nearby", id: objects.find((object) => object.type === "building" && object.route === "wardrobe").id });
  expect(screen.queryByTestId("tutorial-frame-child-house-back")).toBeNull();
  await emit({ event: "nearby", id: door.id });
  expect(screen.getByTestId("tutorial-frame-child-house-back")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));
  const townExit = getBuildingExitPoint(house as any);
  expect(sentIntents("placePlayer")).toContainEqual({ facingY: townExit.facingY, type: "placePlayer", x: townExit.x, z: townExit.z });
  expect(tutorial.advance).toHaveBeenCalledWith("child-house-back");
});

test("子供の案内は目的の建物の入口を囲み、実際の入場で進む", async () => {
  const tutorial = tutorialValue();
  await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  await emit({ event: "ready" });
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
  await emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId("tutorial-frame-town-tasks")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "入る" }));
  expect(mockPush).toHaveBeenCalledWith("/tasks-child");
  expect(tutorial.advance).toHaveBeenCalledWith("town-tasks");
});

test("建物への遷移に失敗したときは案内を進めず、入り直せたら進む", async () => {
  const tutorial = tutorialValue();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    mockPush.mockImplementationOnce(() => { throw new Error("遷移失敗"); });
    await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
    await enterAtDoor("tasks");
    expect(tutorial.advance).not.toHaveBeenCalled();
    await enterAtDoor("tasks");
    expect(tutorial.advance).toHaveBeenCalledWith("town-tasks");
  } finally { warn.mockRestore(); }
});

test("大人の町の紹介はホームへ戻るボタンで設定の案内へ進む", async () => {
  loginAsParent();
  const tutorial = { ...tutorialValue(), role: "parent" as const, step: TUTORIAL_STEPS.parent.find((step) => step.id === "parent-town-back") };
  await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  await emit({ event: "ready" });
  expect(screen.getByTestId("tutorial-frame-parent-town-back")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(tutorial.advance).toHaveBeenCalledWith("parent-town-back");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFocused = true;
  mockShowHubPerf = false;
  mockOwnedAssets = getPlaceableDecorations().map((asset_id) => ({ asset_id, quantity: 1 }));
  mockOwnedLoading = false;
  mockFeatureRestrictions = [];
  mockFeatureHasData = true;
  mockFeatureError = null;
  useMapStore.getState().setPlacedDecorations([]);
  useMapStore.getState().setFurnitureLayouts([]);
  useAppStore.setState({ user: null });
  useAppearanceStore.setState({
    characterType: "frog",
    characterTypeLoadedFor: null,
    palette: {},
    paletteLoadedFor: null,
    paletteLoadedCharacterType: "frog",
  });
  mockPush.mockImplementation(() => undefined);
  mockCanGoBack.mockReturnValue(true);
  mockFetchCharacterType.mockResolvedValue("frog");
  mockFetchCharacterPalette.mockResolvedValue({});
  delete mockHandlers.onEvent;
  delete mockHandlers.onLoadError;
  mockHandlers.renders = 0;
  mockHandlers.mounts = [];
  useTravelStore.setState({ travel: null });
});

describe("読み込み中の画面（Issue #261）", () => {
  test("シーンの準備ができるまで「いどうちゅう」の画面を重ね、ready で外す", async () => {
    await render(<RpgHubScreen />);
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();

    await emit({ event: "ready" });

    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("歩く姿のコマ絵は、シーンの準備ができてから裏で描く（3Dを同時に2つ立ち上げない）", async () => {
    await render(<RpgHubScreen />);
    expect(screen.queryByTestId("mock-walk-frames-preparer")).toBeNull();

    await emit({ event: "ready" });

    expect(screen.getByTestId("mock-walk-frames-preparer")).toBeTruthy();
  });

  test("ready も error も来ないまま止まったら、一定時間で重ねるのをやめ、再読み込みのボタンを見せる", async () => {
    jest.useFakeTimers();
    try {
      await render(<RpgHubScreen />);

      await act(() => jest.advanceTimersByTime(SCENE_LOAD_TIMEOUT_MS - 1));
      expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();

      await act(() => jest.advanceTimersByTime(1));
      expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
      expect(screen.getByRole("button", { name: "マップを再読み込みする" })).toBeTruthy();

      // 遅れて ready が届いたら、エラーは消える
      await emit({ event: "ready" });
      expect(screen.queryByRole("button", { name: "マップを再読み込みする" })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("準備に失敗したら重ねず、エラーと再読み込みのボタンを見せる。再読み込みするとまた重ねる", async () => {
    await render(<RpgHubScreen />);

    await act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });

    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
  });

  test("設定を開くときは、建物へ入るのではないので移動を始めない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await pressMenuItem("設定を開く");
    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("建物へ入ると、移動を始める", async () => {
    await render(<RpgHubScreen />);

    await enterAtDoor("bank");

    expect(useTravelStore.getState().travel).not.toBeNull();
  });

  test("建物から戻ってきたら「いどうちゅう」を始め、扉の前へ立たせ直したら閉じてよいと知らせる", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await enterAtDoor("bank");
    const enterTravelId = useTravelStore.getState().travel?.id;
    mockSendIntent.mockClear();

    await refocus();

    const travel = useTravelStore.getState().travel;
    // 入るときの移動とは別の、戻るときの移動になっている
    expect(travel).not.toBeNull();
    expect(travel?.id).not.toBe(enterTravelId);
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(travel?.waiting).toBe(false);
  });

  test("シーンの準備ができる前に戻ってきたら、立たせ直せるまで読み込み中のままにする", async () => {
    await render(<RpgHubScreen />);
    await enterAtDoor("bank");

    await refocus();
    expect(useTravelStore.getState().travel?.waiting).toBe(true);

    await emit({ event: "ready" });
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(useTravelStore.getState().travel?.waiting).toBe(false);
  });

  test("再読み込みした WebView の ready が届くまでは、扉の前へ立たせず読み込み中のままにする", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await enterAtDoor("bank");
    // 建物にいる間にシーンが壊れ、再読み込みした（sceneGeneration は0へ戻らない）
    await act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });
    await fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    mockSendIntent.mockClear();

    await refocus();
    expect(sentIntents("placePlayer")).toHaveLength(0);
    expect(useTravelStore.getState().travel?.waiting).toBe(true);

    await emit({ event: "ready" });
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(useTravelStore.getState().travel?.waiting).toBe(false);
  });

  test("建物にいる間にシーンが壊れていたら、戻ってきたときに重ねず、エラーを見せる", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await enterAtDoor("bank");
    // 建物にいる間に壊れ、再読み込みした WebView も準備できないまま失敗した
    await act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });
    await fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    await act(() => {
      mockHandlers.onLoadError?.("また読み込めませんでした");
    });

    await refocus();

    expect(useTravelStore.getState().travel).toBeNull();
    expect(screen.getByRole("button", { name: "マップを再読み込みする" })).toBeTruthy();
  });

  test("戻ってきたときにシーンが壊れていたら、重ねるのをやめてエラーを見せる", async () => {
    await render(<RpgHubScreen />);
    await enterAtDoor("bank");
    await refocus();

    await act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });

    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("建物以外（設定など）から戻ってきたときは、移動を始めない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await pressMenuItem("設定を開く");

    await refocus();

    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("建物への遷移に失敗したら、移動をやめる", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockPush.mockImplementation(() => {
      throw new Error("遷移できません");
    });
    await render(<RpgHubScreen />);

    await enterAtDoor("bank");

    expect(useTravelStore.getState().travel).toBeNull();
    warnSpy.mockRestore();
  });
});

/** 家の中のプレイヤー。部屋のまん中より少し手前に立たせる */
const HOUSE_PLAYER = { x: HOUSE_ROOM_CENTER.x, z: HOUSE_ROOM_CENTER.z + 2.5 };
/** 家の中の、何も無いはずの場所 */
const HOUSE_FREE_POINT = { x: HOUSE_ROOM_CENTER.x - 2, z: HOUSE_ROOM_CENTER.z };

/**
 * 置いた装飾を作り、マップに載せる（DBから読んだものと同じく `placed-` で始まるid）。
 * @param assetId - 装飾
 * @param point - 置く場所
 * @param id - id
 */
const putPlaced = async (assetId: string, point: { x: number; z: number }, id: string) => {
  const object = { ...createDecorationCandidate(assetId, point), id };
  await act(() => {
    useMapStore.getState().setPlacedDecorations([...useMapStore.getState().placedDecorations, object]);
  });
  return object;
};

/** 家の中に立って、かざるの編集モードを始める */
const startEditingInHouse = async () => {
  await render(<RpgHubScreen />);
  await emit({ event: "ready" });
  await emit({ direction: "up", event: "position", facingY: 0, x: HOUSE_PLAYER.x, z: HOUSE_PLAYER.z });
  await pressMenuItem("かざるをはじめる");
};

describe("かざるの編集モード（Issue #477）", () => {
  test("始めると映す範囲をシーンへ送り、スティックと住人を止める。「おわる」で元に戻す", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const lastPad = () => mockPadProps.mock.calls.at(-1)?.[0] as any;
    expect(lastPad().disabled).toBe(false);

    await pressMenuItem("かざるをはじめる");

    expect(sentIntents("setEditMode").at(-1)?.area).toEqual(getEditArea({ x: 0, z: 0 }));
    expect(lastPad().disabled).toBe(true);
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({ enabled: false, type: "setInputEnabled" });

    await fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    expect(sentIntents("setEditMode").at(-1)?.area).toBeNull();
    expect(lastPad().disabled).toBe(false);
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({ enabled: true, type: "setInputEnabled" });
    expect(screen.queryByTestId("decoration-panel")).toBeNull();
  });

  test("「もとに もどす」で、指で変えたズームと移動をやめるようシーンへ伝える", async () => {
    await startEditingInHouse();

    await fireEvent.press(screen.getByRole("button", { name: "みえかたをもとにもどす" }));

    expect(sentIntents("resetEditView")).toEqual([{ type: "resetEditView" }]);
  });

  test("編集中はメニューを出さず、マップも開けない（キャラクターだけ別の場所へ動かさない。CodeRabbitレビュー指摘）", async () => {
    await startEditingInHouse();

    expect(screen.queryByRole("button", { name: "メニューを開く" })).toBeNull();
    const map = screen.getByRole("button", { name: "マップを開く" });
    expect(map.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(map);
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
  });

  test("家の中で始めると、部屋全体を映す。パネルが隠す高さも伝える", async () => {
    await startEditingInHouse();

    expect(sentIntents("setEditMode").at(-1)?.area).toEqual(getEditArea(HOUSE_PLAYER));

    await fireEvent(screen.getByTestId("decoration-panel"), "layout", {
      nativeEvent: { layout: { height: 288, width: 360, x: 0, y: 0 } },
    });
    // パネルの高さに、下のすき間（12）を足した分
    expect(sentIntents("setEditMode").at(-1)?.insets.bottom).toBe(300);
  });

  test("持ち物の取得中に始めても、取得後に一覧へ並ぶ", async () => {
    mockOwnedAssets = [];
    mockOwnedLoading = true;
    const { rerender } = await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await pressMenuItem("かざるをはじめる");
    expect(mockReloadOwnedAssets).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ストアの「かざり」の棚で買うと使えるよ")).toBeTruthy();

    mockOwnedAssets = [{ asset_id: "decoration-lamp", quantity: 2 }];
    mockOwnedLoading = false;
    await rerender(<RpgHubScreen />);
    expect(screen.getByRole("button", { name: "ランプ　あと2こ" })).toBeTruthy();
  });

  test("編集中は、建物に近づいても「入る」ボタンを出さない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
    await emit({ event: "nearby", id: building.id });
    expect(screen.getByRole("button", { name: "入る" })).toBeTruthy();

    await pressMenuItem("かざるをはじめる");

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("置いた装飾をタップすると選び、「まわす」で90度ずつ回す", async () => {
    await startEditingInHouse();
    const lamp = await putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");

    await emit({ event: "editTap", id: lamp.id });

    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: lamp.id, type: "setEditSelection" });
    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));
    expect(mockUpdate).toHaveBeenCalledWith(lamp.id, { rotationY: Math.PI / 2 });
  });

  test("選んだ装飾を「しまう」と、その装飾をしまう", async () => {
    await startEditingInHouse();
    const lamp = await putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    await emit({ event: "editTap", id: lamp.id });

    await fireEvent.press(screen.getByRole("button", { name: "えらんだかざりをしまう" }));

    expect(mockRemove).toHaveBeenCalledWith(lamp.id);
  });

  test("何も無い所をタップしたり「やめる」を押したりすると、選ぶのをやめる", async () => {
    await startEditingInHouse();
    const lamp = await putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    await emit({ event: "editTap", id: lamp.id });

    await emit({ event: "editTap", id: null });
    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: null, type: "setEditSelection" });
    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();

    await emit({ event: "editTap", id: lamp.id });
    await fireEvent.press(screen.getByRole("button", { name: "えらぶのをやめる" }));
    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();
  });

  test("町の固定物（道など）をタップしても選ばない", async () => {
    await startEditingInHouse();
    const fixed = useMapStore.getState().objects.find((object) => object.id === "path-south-0");

    await emit({ event: "editTap", id: fixed.id });

    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();
  });

  test("町に最初からある木をタップすると選べ、「しまう」で町から消える（Issue #509）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await pressMenuItem("かざるをはじめる");

    await emit({ event: "editTap", id: "tree-north" });

    expect(screen.getByText("かざる ▸ き")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "えらんだかざりをしまう" }));

    // 実データを使わない（未ログイン）ときは、画面の中だけでしまう。置いた装飾の「しまう」は使わない
    expect(mockRemove).not.toHaveBeenCalled();
    expect(useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "tree-north")?.stored).toBe(true);
    expect(useMapStore.getState().objects.some((object) => object.id === "tree-north")).toBe(false);
    // しまった装飾が下の一覧に出るよう、持ち物を取り直す（始めたときの1回と合わせて2回）
    expect(mockReloadOwnedAssets).toHaveBeenCalledTimes(2);
  });

  test("町に最初からある木を持ち上げて、空いているマスに下ろすと動く。大きさは変わらない（Issue #509）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await pressMenuItem("かざるをはじめる");
    const before = useMapStore.getState().objects.find((object) => object.id === "tree-north");

    await emit({ event: "editLift", id: "tree-north" });
    // 西へ2マス
    await emit({ assetId: before.model, event: "editDrop", id: "tree-north", x: before.position.x - 1.8, z: before.position.z });

    const after = useMapStore.getState().objects.find((object) => object.id === "tree-north");
    expect(after.position.x).toBeCloseTo(before.position.x - 1.8);
    expect(after.scale).toBe(before.scale);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "tree-north")?.stored).toBe(false);
  });

  test("町に最初からある木を選んで「まわす」と、90度回して保存する（Issue #509）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await pressMenuItem("かざるをはじめる");
    const before = useMapStore.getState().objects.find((object) => object.id === "tree-north");

    await emit({ event: "editTap", id: "tree-north" });
    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    const after = useMapStore.getState().objects.find((object) => object.id === "tree-north");
    expect(after.rotationY).toBeCloseTo(Math.PI / 2);
    expect(after.position).toEqual(before.position);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("一覧から引っぱってきた装飾を、置けるマスに下ろすと置く", async () => {
    await startEditingInHouse();
    const snapped = createDecorationCandidate("decoration-lamp", HOUSE_FREE_POINT);

    await emit({ assetId: "decoration-lamp", event: "editDrop", id: null, x: snapped.position.x, z: snapped.position.z });

    expect(mockPlace).toHaveBeenCalledWith({
      assetId: "decoration-lamp",
      rotationY: 0,
      scale: 1,
      x: snapped.position.x,
      z: snapped.position.z,
    });
  });

  test("置けないマスに下ろすと理由を出し、置かない", async () => {
    await startEditingInHouse();
    const rock = await putPlaced("decoration-rock", HOUSE_FREE_POINT, "placed-rock");

    await emit({ assetId: "decoration-lamp", event: "editDrop", id: null, x: rock.position.x, z: rock.position.z });

    expect(mockPlace).not.toHaveBeenCalled();
    expect(screen.getByText("ここには おけません")).toBeTruthy();
  });

  test("持ち上げて動かした装飾を、置けるマスに下ろすと動かす", async () => {
    await startEditingInHouse();
    const lamp = await putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    const target = createDecorationCandidate("decoration-lamp", { x: HOUSE_FREE_POINT.x, z: HOUSE_FREE_POINT.z - 0.9 });

    await emit({ event: "editLift", id: lamp.id });
    await emit({ assetId: "decoration-lamp", event: "editDrop", id: lamp.id, x: target.position.x, z: target.position.z });

    expect(mockUpdate).toHaveBeenCalledWith(lamp.id, { x: target.position.x, z: target.position.z });
  });

  test("クローゼットをタップすると選べ、「しまう」は出さずに「まわす」で回せる", async () => {
    await startEditingInHouse();

    await emit({ event: "editTap", id: "house-closet" });

    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: "house-closet", type: "setEditSelection" });
    expect(screen.getByText("かざる ▸ クローゼット")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "えらんだかざりをしまう" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    // 実データを使わない（未ログイン）ときは、画面の中だけで動かす
    const layout = useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "house-closet");
    expect(layout?.rotationY).toBeCloseTo(Math.PI / 2);
    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(closet?.rotationY).toBeCloseTo(Math.PI / 2);
  });

  test("ソファをタップすると選べ、「しまう」で家の中から消える（Issue #506）", async () => {
    await startEditingInHouse();

    await emit({ event: "editTap", id: "house-sofa" });

    expect(screen.getByText("かざる ▸ ソファ")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "えらんだかざりをしまう" }));

    // 実データを使わない（未ログイン）ときは、画面の中だけでしまう
    expect(useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "house-sofa")?.stored).toBe(true);
    expect(useMapStore.getState().objects.some((object) => object.id === "house-sofa")).toBe(false);
    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: null, type: "setEditSelection" });
    // しまった装飾が下の一覧に出るよう、持ち物を取り直す
    expect(mockReloadOwnedAssets).toHaveBeenCalled();
    // しまっていないほかの家具はそのまま
    expect(useMapStore.getState().objects.some((object) => object.id === "house-plant")).toBe(true);
  });

  test("植木を持ち上げて、空いているマスに下ろすと動く（Issue #506）", async () => {
    await startEditingInHouse();
    const before = useMapStore.getState().objects.find((object) => object.id === "house-plant");

    await emit({ event: "editLift", id: "house-plant" });
    await emit({ assetId: before.model, event: "editDrop", id: "house-plant", x: HOUSE_FREE_POINT.x, z: HOUSE_FREE_POINT.z });

    const after = useMapStore.getState().objects.find((object) => object.id === "house-plant");
    expect(after.position.x).not.toBeCloseTo(before.position.x);
    expect(after.position.z).not.toBeCloseTo(before.position.z);
    expect(useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "house-plant")?.stored).toBe(false);
  });

  test("奥の壁ぎわでは、正面が壁を向く向きを飛ばして回す（0度と90度を行き来し、位置もずれない）", async () => {
    await startEditingInHouse();
    const start = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    await emit({ event: "editTap", id: "house-closet" });

    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));
    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(closet.rotationY ?? 0).toBeCloseTo(0);
    expect(closet.position.x).toBeCloseTo(start.position.x);
    expect(closet.position.z).toBeCloseTo(start.position.z);
    expect(screen.queryByText("ここでは まわせません")).toBeNull();
  });

  test("クローゼットを持ち上げて、空いているマスに下ろすと動く", async () => {
    await startEditingInHouse();
    const before = useMapStore.getState().objects.find((object) => object.id === "house-closet");

    await emit({ event: "editLift", id: "house-closet" });
    await emit({ assetId: before.model, event: "editDrop", id: "house-closet", x: HOUSE_FREE_POINT.x, z: HOUSE_FREE_POINT.z });

    const after = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(after.position.x).not.toBeCloseTo(before.position.x);
    expect(after.position.z).not.toBeCloseTo(before.position.z);
  });

  test("回すと置いた装飾にぶつかるときは、クローゼットを回さない", async () => {
    await startEditingInHouse();
    // クローゼットは横2 × 奥行き1マス。90度回すと縦長になり、すぐ手前（2行目）のマスまで占める
    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    const turned = placeFurnitureAt(closet, getFurnitureRotationCenter(closet, Math.PI / 2), Math.PI / 2);
    const cells = getObjectCells(turned);
    await putPlaced("decoration-lamp", {
      x: HOUSE_GRID_ORIGIN.x + (cells.col + 0.5) * TOWN_CELL_SIZE,
      z: HOUSE_GRID_ORIGIN.z + (cells.row + cells.rows - 0.5) * TOWN_CELL_SIZE,
    }, "placed-lamp");
    await emit({ event: "editTap", id: "house-closet" });

    await fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    expect(screen.getByText("ここでは まわせません")).toBeTruthy();
    expect(useMapStore.getState().objects.find((object) => object.id === "house-closet")?.rotationY ?? 0).toBeCloseTo(0);
  });

  test("編集中はキャラクターが立っていたマスにも置ける。終えるとき、そこに物があればキャラクターを玄関へ移す", async () => {
    await startEditingInHouse();
    // キャラクター（HOUSE_PLAYER）の足元に岩を置く。編集中はキャラクターを消し、玄関に立っているものとして判定する
    const rock = createDecorationCandidate("decoration-rock", HOUSE_PLAYER);
    await emit({ assetId: "decoration-rock", event: "editDrop", id: null, x: rock.position.x, z: rock.position.z });
    expect(mockPlace).toHaveBeenCalledWith(expect.objectContaining({ assetId: "decoration-rock" }));

    // 保存が終わって、岩がマップに載った
    await putPlaced("decoration-rock", HOUSE_PLAYER, "placed-rock");
    const placeCount = sentIntents("placePlayer").length;
    await fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    const door = useMapStore
      .getState()
      .objects.find((object): object is BuildingMapObject => object.type === "building" && object.route === "exit");
    const exit = getBuildingExitPoint(door);
    expect(sentIntents("placePlayer").slice(placeCount)).toEqual([
      { facingY: exit.facingY, type: "placePlayer", x: exit.x, z: exit.z },
    ]);
  });

  test("終えるとき、キャラクターの足元が空いていれば動かさない", async () => {
    await startEditingInHouse();
    const placeCount = sentIntents("placePlayer").length;

    await fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    expect(sentIntents("placePlayer").length).toBe(placeCount);
  });

  test("置けないマスへ動かしたら、マップを送り直して見た目を元へ戻す", async () => {
    await startEditingInHouse();
    const lamp = await putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    const rock = await putPlaced("decoration-rock", { x: HOUSE_FREE_POINT.x + 3, z: HOUSE_FREE_POINT.z }, "placed-rock");
    const setMapCount = sentIntents("setMap").length;

    await emit({ assetId: "decoration-lamp", event: "editDrop", id: lamp.id, x: rock.position.x, z: rock.position.z });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sentIntents("setMap").length).toBe(setMapCount + 1);
    expect(screen.getByText("ここには おけません")).toBeTruthy();
  });
});

describe("BGM", () => {
  test("画面のフォーカス中だけ再生し、離れたら停止する", async () => {
    await render(<RpgHubScreen />);

    let cleanup: (() => void) | undefined;
    const focusEffects = [...mockUseFocusEffect.mock.calls];
    await act(() => {
      for (const [effect] of focusEffects) {
        const startsBefore = mockStartBgm.mock.calls.length;
        const candidate = effect();
        if (mockStartBgm.mock.calls.length > startsBefore) {
          expect(typeof candidate).toBe("function");
          cleanup = candidate as () => void;
          break;
        }
      }
    });

    expect(mockStartBgm).toHaveBeenCalledTimes(1);

    await act(() => {
      cleanup?.();
    });
    expect(mockStopBgm).toHaveBeenCalledTimes(1);
  });
});

describe("マップの送り込み", () => {
  test("ready を受け取るとマップと季節を送る", async () => {
    await render(<RpgHubScreen />);
    expect(sentIntents("setMap")).toHaveLength(0);

    await emit({ event: "ready" });

    const intents = sentIntents("setMap");
    expect(intents).toHaveLength(1);
    expect(intents[0].objects.length).toBeGreaterThan(0);
    expect(typeof intents[0].season).toBe("string");
  });

  test("WebView が再ロードして ready を再送したら、マップを送り直す", async () => {
    // バックグラウンド復帰などでシーンが作り直されたとき、送り直さないと
    // 建物が無い空のマップのままになる。
    await render(<RpgHubScreen />);

    await emit({ event: "ready" });
    await emit({ event: "ready" });

    expect(sentIntents("setMap")).toHaveLength(2);
  });
});

describe("季節（Issue #282）", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ready を受け取ると、setMap と同じ季節を setSeason でも送る", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    const [map] = sentIntents("setMap");
    expect(sentIntents("setSeason")).toEqual([{ season: map.season, type: "setSeason" }]);
  });

  test("季節が変わったら setSeason だけを送り、マップは送り直さない", async () => {
    // setMap を送り直すと、WebView 側が建物や木まで作り直し、住人の立ち位置も初期化される
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const next = useMapStore.getState().currentSeason === "winter" ? "spring" : "winter";

    await act(() => {
      useMapStore.setState({ currentSeason: next });
    });

    expect(sentIntents("setMap")).toHaveLength(1);
    expect(sentIntents("setSeason").at(-1)).toEqual({ season: next, type: "setSeason" });
  });

  test("開いたまま季節の変わり目をまたぐと、季節が切り替わる", async () => {
    jest.useFakeTimers({ now: new Date(2026, 4, 31, 23, 59, 0) });
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    expect(useMapStore.getState().currentSeason).toBe("spring");

    await act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(useMapStore.getState().currentSeason).toBe("summer");
    expect(sentIntents("setSeason").at(-1)).toEqual({ season: "summer", type: "setSeason" });
  });
});

describe("プレイヤーの色（Issue #254）", () => {
  test("ready を受け取ると本人の色を送る。未設定なら空（既定の色）", async () => {
    await render(<RpgHubScreen />);
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);

    await emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toEqual([{ palette: {}, type: "setPlayerPalette" }]);
  });

  test("色が変わったら送り直す", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await act(() => {
      useAppearanceStore.getState().setPalette({ skin: "#abcdef" }, null, "frog");
    });

    expect(sentIntents("setPlayerPalette").at(-1)).toEqual({
      palette: { skin: "#abcdef" },
      type: "setPlayerPalette",
    });
    expect(mockHandlers.mounts).toEqual(["frog"]);
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("WebView が再ロードして ready を再送したら、色も送り直す", async () => {
    await render(<RpgHubScreen />);
    // 再生成直後のシーンは既定の色に戻っているため。
    // マウント直後は useCharacterPalette（Issue #253）が既定へ戻すため、render後にセットする
    await act(() => {
      useAppearanceStore.getState().setPalette({ accent: "#123456" }, null, "frog");
    });

    await emit({ event: "ready" });
    await emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toHaveLength(2);
    expect(sentIntents("setPlayerPalette")[1].palette).toEqual({ accent: "#123456" });
  });

  test("同じ色を反映し直しても、送り直さない", async () => {
    await render(<RpgHubScreen />);
    await act(() => {
      useAppearanceStore.getState().setPalette({ skin: "#abcdef" }, null, "frog");
    });
    await emit({ event: "ready" });
    expect(sentIntents("setPlayerPalette")).toHaveLength(1);

    await act(() => {
      useAppearanceStore.getState().setPalette({ skin: "#abcdef" }, null, "frog");
    });

    expect(sentIntents("setPlayerPalette")).toHaveLength(1);
  });

  test("種類の読み込みを待ち、ねこ用に保存された色をねこのシーンへ送る（Issue #381）", async () => {
    // 以前はカエル以外には保存済みの色を当てず、空の色を送っていた。
    // 更衣室で選んだねこ用の色を、ねこのシーンに送る。
    // ログイン直後にタウンを開く経路（種類の読み込みが終わってからマウントされる）で確かめる。
    const REAL_USER_ID = "11111111-1111-1111-1111-111111111111";
    useAppStore.setState({
      user: {
        balance: 0,
        created_at: "2026-07-01T00:00:00Z",
        id: REAL_USER_ID,
        name: "テスト",
        role: "child",
      },
    });
    useAppearanceStore.setState({ palette: { skin: "#abcdef" } });

    let resolveType: (value: unknown) => void = () => undefined;
    mockFetchCharacterType.mockReturnValue(new Promise((resolve) => (resolveType = resolve)));
    mockFetchCharacterPalette.mockResolvedValue({ skin: "#abcdef" });

    await render(<RpgHubScreen />);

    // 読み込み中は「マップを準備中…」のままで、RpgHubWebViewはまだマウントされない
    expect(mockHandlers.onEvent).toBeUndefined();

    await act(async () => {
      resolveType("cat");
      await Promise.resolve();
      await Promise.resolve();
    });

    // ここでRpgHubWebViewが実際に「ねこ」としてマウントされる
    expect(mockHandlers.onEvent).toBeDefined();
    expect(mockHandlers.mounts).toEqual(["cat"]);
    await emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toEqual([
      { palette: { skin: "#abcdef" }, type: "setPlayerPalette" },
    ]);
    expect(mockFetchCharacterPalette).toHaveBeenCalledWith(REAL_USER_ID, "cat");
  });

  test("キャラ選び中は町を作り直さず、戻った時点の種類だけ反映し、準備後に色を送る（Issue #483）", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    useAppStore.setState({ user: {
      balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
    } });
    mockFetchCharacterPalette.mockImplementation(async (_userId, type) =>
      type === "cat" ? { skin: "#e74c3c" } : { skin: "#4a90e2" },
    );
    const view = await render(<RpgHubScreen />);
    await act(async () => undefined);
    await emit({ event: "ready" });
    expect(sentIntents("setPlayerPalette").at(-1).palette).toEqual({ skin: "#4a90e2" });
    expect(mockHandlers.mounts).toEqual(["frog"]);
    const oldOnEvent = mockHandlers.onEvent;
    const oldOnLoadError = mockHandlers.onLoadError;
    await emit({ direction: "up", event: "position", facingY: 1.2, ...HOUSE_PLAYER });
    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    mockIsFocused = false;
    await view.rerender(<RpgHubScreen />);
    expect(screen.queryByTestId("mock-walk-frames-preparer")).toBeNull();
    mockSendIntent.mockClear();

    await act(async () => {
      useAppearanceStore.getState().setCharacterType("cat", userId);
    });
    expect(mockFetchCharacterPalette).toHaveBeenCalledWith(userId, "cat");
    await act(async () => { useAppearanceStore.getState().setCharacterType("dog", userId); });
    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", userId); });
    expect(mockHandlers.mounts).toEqual(["frog"]);
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);
    mockIsFocused = true;
    await view.rerender(<RpgHubScreen />);
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);
    expect(mockHandlers.mounts).toEqual(["frog", "cat"]);
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();

    // 破棄したシーンの通知では、新しいシーンの待機を終えず、エラーにも戻さない。
    await act(() => {
      oldOnEvent?.({ event: "ready" });
      oldOnLoadError?.("古いシーンのエラー");
    });
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "マップを再読み込みする" })).toBeNull();
    // 新しいシーンの初期座標が届いても、作り直す前の家の中の位置へ戻す。
    await emit({ direction: "up", event: "position", facingY: 0, x: 0, z: 0 });
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    await emit({ event: "ready" });
    // ready後の初期座標も、復元完了の通知までは使わない。
    await emit({ direction: "up", event: "position", facingY: 0, x: 0, z: 0 });
    await emit({ event: "playerPlaced", requestId: "古い復元の通知" });
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
    expect(sentIntents("setMap")).toHaveLength(0);
    await confirmPlayerPlacement();
    expect(sentIntents("setPlayerPalette").at(-1).palette).toEqual({ skin: "#e74c3c" });
    expect(sentIntents("setMap")).toHaveLength(1);
    expect(sentIntents("setPlayerEquipment")).toHaveLength(1);
    expect(sentIntents("placePlayer")).toEqual([{ type: "placePlayer", facingY: 1.2,
      requestId: expect.any(String), ...HOUSE_PLAYER }]);
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();

    await act(() => { useAppearanceStore.getState().setCharacterType("cat", userId); });
    expect(mockHandlers.mounts).toEqual(["frog", "cat"]);
  });

  test("キャラ選び中に元の種類へ戻したら、町へ戻っても作り直さない", async () => {
    const view = await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    mockIsFocused = false;
    await view.rerender(<RpgHubScreen />);

    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", null); });
    await act(async () => { useAppearanceStore.getState().setCharacterType("frog", null); });
    mockIsFocused = true;
    await view.rerender(<RpgHubScreen />);

    expect(mockHandlers.mounts).toEqual(["frog"]);
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("初回の座標通知前に種類を変えても、シーンの初期位置で再開する", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", null); });
    mockSendIntent.mockClear();
    await emit({ event: "ready" });

    expect(sentIntents("placePlayer")).toEqual([{ type: "placePlayer", facingY: 0, x: 0, z: 0,
      requestId: expect.any(String) }]);
    await confirmPlayerPlacement();
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("種類の変更後に色の読み込みが遅れても、新しい形の準備後に届いた色を反映する", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    useAppStore.setState({ user: {
      balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
    } });
    let resolvePalette: (palette: unknown) => void;
    mockFetchCharacterPalette.mockImplementation(async (_userId, type) =>
      type === "cat" ? new Promise((resolve) => { resolvePalette = resolve; }) : { skin: "#4a90e2" },
    );
    await render(<RpgHubScreen />);
    await act(async () => undefined);
    await emit({ event: "ready" });
    mockSendIntent.mockClear();

    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", userId); });
    await emit({ event: "ready" });
    await confirmPlayerPlacement();
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);

    await act(async () => { resolvePalette({ skin: "#e74c3c" }); });
    expect(sentIntents("setPlayerPalette")).toEqual([
      { palette: { skin: "#e74c3c" }, type: "setPlayerPalette" },
    ]);
    expect(mockHandlers.mounts).toEqual(["frog", "cat"]);
  });

  test("準備中に元の種類へ戻しても、最初のシーンの ready で待機を終えない", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    useAppStore.setState({ user: {
      balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
    } });
    await render(<RpgHubScreen />);
    await act(async () => undefined);
    await emit({ event: "ready" });
    const firstFrogEvent = mockHandlers.onEvent;

    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", userId); });
    const catEvent = mockHandlers.onEvent;
    await act(async () => { useAppearanceStore.getState().setCharacterType("frog", userId); });
    expect(mockHandlers.mounts).toEqual(["frog", "cat", "frog"]);
    mockSendIntent.mockClear();

    await act(() => {
      firstFrogEvent?.({ event: "ready" });
      catEvent?.({ event: "ready" });
    });
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);
    await emit({ event: "ready" });
    await confirmPlayerPlacement();
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
    expect(sentIntents("setPlayerPalette")).toHaveLength(1);
  });

  test("別の利用者の種類の読み込み中はシーンを外し、読み込み後も新しい ready を待つ", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const userId = "11111111-1111-1111-1111-111111111111";
    let resolveType: (value: unknown) => void;
    mockFetchCharacterType.mockReturnValue(new Promise((resolve) => { resolveType = resolve; }));
    await act(async () => {
      useAppStore.setState({ user: {
        balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
      } });
    });
    expect(screen.getByTestId("mock-travel-loading-screen")).toBeTruthy();
    expect(mockHandlers.mounts).toEqual(["frog"]);

    await act(async () => { resolveType("frog"); });
    expect(mockHandlers.mounts).toEqual(["frog", "frog"]);
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
    mockSendIntent.mockClear();
    await emit({ event: "ready" });
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
    expect(sentIntents("placePlayer")).toHaveLength(0);
  });

  test("町が裏にある間の利用者切り替えは、読み込んだ新しい種類で1回だけ組み立てる", async () => {
    const view = await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    mockIsFocused = false;
    await view.rerender(<RpgHubScreen />);
    const userId = "11111111-1111-1111-1111-111111111111";
    let resolveType: (value: unknown) => void;
    mockFetchCharacterType.mockReturnValue(new Promise((resolve) => { resolveType = resolve; }));
    await act(async () => {
      useAppStore.setState({ user: {
        balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
      } });
    });
    expect(screen.getByTestId("mock-travel-loading-screen")).toBeTruthy();
    expect(mockHandlers.mounts).toEqual(["frog"]);

    await act(async () => { resolveType("cat"); });
    expect(mockHandlers.mounts).toEqual(["frog", "cat"]);
    await emit({ event: "ready" });
    expect(sentIntents("placePlayer")).toHaveLength(0);
    mockIsFocused = true;
    await view.rerender(<RpgHubScreen />);
    expect(mockHandlers.mounts).toEqual(["frog", "cat"]);
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("同じWebViewの再ロードは初期座標通知前でも原点に戻し、次の復元にも古い位置を使わない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await emit({ event: "position", facingY: 1.2, ...HOUSE_PLAYER });
    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    mockSendIntent.mockClear();

    await emit({ event: "ready" });
    expect(screen.queryByRole("button", { name: "家の外に出る" })).toBeNull();
    expect(sentIntents("placePlayer")).toHaveLength(0);

    // 初期座標の通知が届くより先に種類を変えても、家の中へは復元しない。
    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", null); });
    await emit({ event: "ready" });
    expect(sentIntents("placePlayer").at(-1)).toMatchObject({ facingY: 0, x: 0, z: 0 });
    await confirmPlayerPlacement();
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("復元完了前にもう一度作り直しても、古い配置完了では待機を終えない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await emit({ event: "position", facingY: 1.2, ...HOUSE_PLAYER });
    await act(async () => { useAppearanceStore.getState().setCharacterType("cat", null); });
    await emit({ event: "ready" });
    const oldRequestId = sentIntents("placePlayer").at(-1).requestId;
    await act(async () => { useAppearanceStore.getState().setCharacterType("dog", null); });
    await emit({ event: "ready" });
    await emit({ event: "playerPlaced", requestId: oldRequestId });
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
    expect(sentIntents("placePlayer").at(-1)).toMatchObject({ facingY: 1.2, ...HOUSE_PLAYER });
    await confirmPlayerPlacement();
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("配置完了が届かなくても待ち続けず、再読み込みできる", async () => {
    jest.useFakeTimers();
    try {
      await render(<RpgHubScreen />);
      await emit({ event: "ready" });
      await act(async () => { useAppearanceStore.getState().setCharacterType("cat", null); });
      await emit({ event: "ready" });
      await act(() => jest.advanceTimersByTime(SCENE_LOAD_TIMEOUT_MS));
      expect(screen.getByRole("button", { name: "マップを再読み込みする" })).toBeTruthy();
      expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
      await confirmPlayerPlacement();
      expect(screen.queryByRole("button", { name: "マップを再読み込みする" })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * 右上のメニューを開いて、中のボタンを押す。
 * @param name - 押すボタンのラベル
 */
async function pressMenuItem(name: string) {
  await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
  await fireEvent.press(screen.getByRole("button", { name }));
}

describe("大人用の戻るボタン", () => {
  test("子供には出さない（この画面がホームのため）", async () => {
    await render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "ホームに戻る" })).toBeNull();
  });

  test("大人には出し、押すと前の画面へ戻る", async () => {
    loginAsParent();
    await render(<RpgHubScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("戻る先の履歴が無ければ、大人用ホームへ移る", async () => {
    mockCanGoBack.mockReturnValue(false);
    loginAsParent();
    await render(<RpgHubScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/main-adult");
  });
});

describe("右上のメニュー", () => {
  test("ふだんはメニューボタンだけを出し、押すと中のボタンが出る", async () => {
    await render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.queryByRole("button", { name: "かざるをはじめる" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));

    for (const name of ["キャラクターをえらぶ", "かざるをはじめる", "きがえを開く", "設定を開く"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  test("「かざる」の絵は、町では木、家の中ではソファにする（Issue #506）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    expect(within(screen.getByRole("button", { name: "かざるをはじめる" })).getByText("🌳")).toBeTruthy();

    await emit({ direction: "up", event: "position", facingY: 0, x: HOUSE_PLAYER.x, z: HOUSE_PLAYER.z });

    expect(within(screen.getByRole("button", { name: "かざるをはじめる" })).getByText("🛋️")).toBeTruthy();
  });

  test("もう一度押すと閉じる", async () => {
    await render(<RpgHubScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    await fireEvent.press(screen.getByRole("button", { name: "メニューを閉じる" }));

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
  });

  test("中のボタンを押すとメニューが閉じる", async () => {
    await render(<RpgHubScreen />);

    await pressMenuItem("かざるをはじめる");

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "かざるのをおわる" })).toBeTruthy();
  });
});

describe("画面遷移", () => {
  test("iOS の戻るスワイプは画面の左端からだけにする（Issue #371）", async () => {
    await render(<RpgHubScreen />);

    // iOS 26 からは画面のどこからでも戻るスワイプが効くため、キャラクターを右へ動かすと
    // ホームへ戻されてしまう。明示的に切っておく。
    // toHaveBeenCalledWith だと過去のどれか1回が一致すれば通ってしまうため、
    // 最後に描かれた options を確かめる（1R0Uレビュー対応）
    const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
    expect(lastProps?.options).toEqual(expect.objectContaining({ fullScreenGestureEnabled: false }));
  });

  test("ナビゲーションの見出し（rpg-hub の白い帯）を出さない", async () => {
    await render(<RpgHubScreen />);

    const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
    expect(lastProps?.options).toEqual(expect.objectContaining({ headerShown: false }));
  });

  test("設定ボタンからの遷移でも WebView の入力を止める", async () => {
    await render(<RpgHubScreen />);

    await pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledWith("/settings-child");
    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });

  test("大人が設定ボタンを押すと、大人用の設定画面を開く（Issue #439）", async () => {
    loginAsParent();
    await render(<RpgHubScreen />);

    await pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledWith("/settings-adult");
  });

  test("設定ボタンを連打しても1回しか遷移しない", async () => {
    await render(<RpgHubScreen />);

    // 押すとメニューが閉じるので、2回目は開き直してから押す
    await pressMenuItem("設定を開く");
    await pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("遷移に失敗したら入力を戻して再操作できる", async () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    await pressMenuItem("設定を開く");

    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: true,
      type: "setInputEnabled",
    });

    await pressMenuItem("設定を開く");
    expect(mockPush).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  test("接近中に「入る」を押すと対象の建物の画面へ遷移する", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    const [building] = sentIntents("setMap")[0].objects.filter(
      (object: any) => object.type === "building",
    );
    await emit({ event: "nearby", id: building.id });

    await fireEvent.press(screen.getByRole("button", { name: "入る" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute(building.route, undefined));
  });

  test("大人が入っているときは、建物の行き先が大人用の画面になる", async () => {
    // Issue #247: 子供用タスク画面は「自分が子供として報告する」画面なので、
    // 大人がそのまま入ると意味がねじれる
    loginAsParent();
    await render(<RpgHubScreen />);

    await enterAtDoor("tasks");

    expect(mockPush).toHaveBeenCalledWith("/tasks-adult");
  });

  test("「入る」が commit を挟まず連続で押されても1回しか遷移しない", async () => {
    // 遷移ロックを state で判定していると、同じ描画のクロージャが 2 回とも
    // ロック解除前の値を読んで多重に router.push してしまう。
    await render(<RpgHubScreen />);
    await emit({ event: "nearby", id: "bank-building" });
    const enter = screen.getByRole("button", { name: "入る" });
    // fireEvent.press は1回ごとに act で描き直してしまうので、押したときの処理を同じ act の中で2回呼ぶ
    const pressEvent = { nativeEvent: {}, preventDefault: () => undefined, stopPropagation: () => undefined };

    await act(() => {
      enter.props.onClick(pressEvent);
      enter.props.onClick(pressEvent);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/bank-child");
  });

  test("シーンから navigate が届いても、建物へは入らない（建物の直接タップは削除した。Issue #491）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await emit({ event: "navigate", id: "bank-building", route: "bank" });

    expect(mockPush).not.toHaveBeenCalled();
    expect(useTravelStore.getState().travel).toBeNull();
  });
});

describe("マップ表示（Issue #314）", () => {
  test("マップを開くと全体マップが表示され、とじるボタンで閉じる", async () => {
    await render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    expect(screen.getByRole("button", { name: "マップを閉じる" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "マップを閉じる" }));
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();
  });

  test("マップを開いても画面遷移やWebViewへの意図送信は起きない", async () => {
    await render(<RpgHubScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSendIntent).not.toHaveBeenCalled();
  });

  test("マップを開いている間はキャラクターの移動入力を止め、閉じたら戻す", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    mockSendIntent.mockClear();

    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });

    await fireEvent.press(screen.getByRole("button", { name: "マップを閉じる" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: true,
      type: "setInputEnabled",
    });
  });
});

describe("マップから建物へワープ（Issue #406）", () => {
  /** マップを開き、建物アイコンをタップして確認を出し、「ワープする」を押すところまで。 */
  async function warpTo(label: string) {
    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    await fireEvent.press(screen.getByRole("button", { name: `${label}へワープ` }));
    await fireEvent.press(screen.getByRole("button", { name: "ワープする" }));
  }

  test("建物アイコンをタップすると、いきなり遷移せず確認を出す", async () => {
    // 誤タップでいきなり画面が変わらないようにするため（ユーザー要望）。
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    await fireEvent.press(screen.getByRole("button", { name: `${BUILDING_MAP_LABELS.bank}へワープ` }));

    // Furiganaはふりがな付きで1文字ずつ描くため、getByTextでは拾えない。
    // accessibilityLabel（ふりがなを除いた文言）で確認する（1R0Uさんレビュー指摘：
    // 確認文にふりがなを付ける）。
    expect(screen.getByLabelText(`${BUILDING_MAP_LABELS.bank}へワープしますか？`)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    // CodeRabbitレビュー指摘：以前は確認カードとマップを三項演算子で切り替えており、
    // 確認中はZoomableMapがアンマウントされていた（「やめる」で戻ると拡大率・位置が
    // リセットされる）。確認中もマウントされたままであることを確かめる。
    expect(screen.getByLabelText("ピンチで拡大・縮小できます", { includeHiddenElements: true })).toBeTruthy();
    // 1R0Uさんレビュー指摘：確認中は、背後の地図の操作（とじるボタンなど）を
    // 読み上げの対象から外す（accessibilityElementsHidden / no-hide-descendants）。
    // 消えたわけではなく隠しただけなので、includeHiddenElementsを付ければ見つかる
    // （getByRoleのname一致は内部でhidden要素を除外した再検索をするため拾えない。
    // accessibilityLabelを直接見るgetByLabelTextで確認する）。
    expect(screen.queryByLabelText("マップを閉じる")).toBeNull();
    expect(screen.getByLabelText("マップを閉じる", { includeHiddenElements: true })).toBeTruthy();
  });

  test("確認で「やめる」を押すと、遷移せずマップの表示に戻る", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    await fireEvent.press(screen.getByRole("button", { name: `${BUILDING_MAP_LABELS.bank}へワープ` }));
    await fireEvent.press(screen.getByRole("button", { name: "やめる" }));

    expect(mockPush).not.toHaveBeenCalled();
    // マップ自体は開いたまま（とじるボタンが見える）
    expect(screen.getByRole("button", { name: "マップを閉じる" })).toBeTruthy();
  });

  test("確認で「ワープする」を押すと、enterBuilding()を通って遷移し、マップが閉じる", async () => {
    // 1R0Uさんレビュー指摘：以前はnavigate()を直接呼んでおり、歩いて入るときと違って
    // 「いどうちゅう」の画面（startTravel）が出なかった。enterBuilding()を通ることを確かめる。
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await warpTo(BUILDING_MAP_LABELS.bank);

    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute("bank", undefined));
    expect(useTravelStore.getState().travel).not.toBeNull();
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();
  });

  test("遷移中（ロック中）に別の建物をタップしても、戻ったときは最初にワープした建物の扉の前に立つ", async () => {
    // enterBuilding()の連打防止（navigationLockedRef）により、2件目のタップは無視される。
    // enteredBuildingIdRefが書き換わっていないことを、戻ってきたときのテレポート先で確かめる
    // （1R0Uさんレビュー指摘）。
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    const buildings = sentIntents("setMap")[0].objects.filter((object: any) => object.type === "building");
    const bank = buildings.find((building: any) => building.route === "bank");
    const store = buildings.find((building: any) => building.route === "store");

    await warpTo(BUILDING_MAP_LABELS.bank);
    expect(mockPush).toHaveBeenCalledTimes(1);

    // ロック中。マップは既に閉じているので、もう一度開いてから別の建物を押す。
    await warpTo(BUILDING_MAP_LABELS.store);
    expect(mockPush).toHaveBeenCalledTimes(1); // 2件目は無視される

    mockSendIntent.mockClear();
    await act(() => {
      for (const [effect] of mockUseFocusEffect.mock.calls) {
        effect();
      }
    });

    const bankExit = getBuildingExitPoint(bank);
    const storeExit = getBuildingExitPoint(store);
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: bankExit.facingY,
      type: "placePlayer",
      x: bankExit.x,
      z: bankExit.z,
    });
    expect(sentIntents("placePlayer")).not.toContainEqual({
      facingY: storeExit.facingY,
      type: "placePlayer",
      x: storeExit.x,
      z: storeExit.z,
    });
  });

  test("自分の家をタップすると、画面遷移せずに家の中の玄関の前へテレポートし、マップが閉じる", async () => {
    // 自分の家の中は町と同じシーンの中にあり、テレポートで入る（Issue #444）。
    // マップからのワープも、歩いて入るときと同じ分岐を通ることを確かめる。
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await warpTo(BUILDING_MAP_LABELS.house);

    const door = buildingWithRoute("exit");
    const entry = getBuildingExitPoint(door);
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: entry.facingY,
      type: "placePlayer",
      x: entry.x,
      z: entry.z,
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();
  });

  test("常時表示のミニマップでは建物アイコンをタップできない（タップで全体マップが開くだけ）", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    expect(screen.queryByRole("button", { name: `${BUILDING_MAP_LABELS.bank}へワープ` })).toBeNull();
  });
});

/**
 * シーンへ送ったマップから、指定した行き先の建物を探す。
 * @param route - 建物の行き先
 * @returns 建物
 */
function buildingWithRoute(route: string): any {
  return sentIntents("setMap")[0].objects.find(
    (object: any) => object.type === "building" && object.route === route,
  );
}

describe("自分の家の中（Issue #444）", () => {
  test("家の中の玄関に近づくと「そとへ でる」が出て、押すと町の家の前へテレポートする", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await emit({ event: "nearby", id: buildingWithRoute("exit").id });
    await fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    const townExit = getBuildingExitPoint(buildingWithRoute("house"));
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: townExit.facingY,
      type: "placePlayer",
      x: townExit.x,
      z: townExit.z,
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("クローゼットに近づくと「きがえる」が出て、押すときがえの画面へ行く", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });
    await fireEvent.press(screen.getByRole("button", { name: "きがえる" }));

    expect(mockPush).toHaveBeenCalledWith("/wardrobe");
  });
});

describe("家族一人ひとりの家（Issue #244）", () => {
  /** 家族の家（houseOwnerId付き）を町に立たせる。取得（useFamilyTown）を通さず、ストアへ直接入れる。 */
  const placeFamilyHouse = async () => {
    await act(() => {
      useMapStore.getState().setFamily(
        buildFamilyHouses([{ id: "member-1" }], "user-parent-1"),
        { familyPendingQuestCount: 0, members: {} },
      );
    });
  };

  afterEach(async () => {
    await act(() => {
      useMapStore.getState().setFamily([], { familyPendingQuestCount: 0, members: {} });
    });
  });

  /** 最後に送ったマップから、指定した houseOwnerId を持つ家（家族の家）を取り出す。 */
  const familyHouseBuilding = () => {
    const snapshots = sentIntents("setMap");
    return snapshots[snapshots.length - 1].objects.find(
      (object: any) => object.type === "building" && object.houseOwnerId === "member-1",
    );
  };

  /** 自分の家（houseOwnerId を持たない、元からある家）の外から、家の中へテレポートする。 */
  const enterOwnHouse = async () => {
    const ownHouse = buildingWithRoute("house");
    await enterAtDoor(ownHouse);
    await emit({ event: "position", facingY: 0, x: 0, z: -76 });
  };

  /** 家族の家の外から、家の中へテレポートする。 */
  const enterFamilyHouse = async () => {
    const familyHouse = familyHouseBuilding();
    await enterAtDoor(familyHouse);
    // 中は共有の1部屋。プレイヤーの実座標がその中へ入ったことにして、実際の見え方に合わせる
    // （houseLocation はプレイヤーの実座標から導く。RpgHubScreen.tsx の houseLocation 参照）。
    await emit({ event: "position", facingY: 0, x: 0, z: -76 });
    return familyHouse;
  };

  test("他の家族の家に入ると、中のクローゼットに近づいても「きがえる」ボタンが出ない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await placeFamilyHouse();
    await enterFamilyHouse();

    await emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });

    expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();
  });

  test("他の家族の家の中でも「そとへ でる」は使え、その家の前（自分の家ではない）へ戻る", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await placeFamilyHouse();
    const familyHouse = await enterFamilyHouse();

    await emit({ event: "nearby", id: buildingWithRoute("exit").id });
    await fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    const exit = getBuildingExitPoint(familyHouse);
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: exit.facingY,
      type: "placePlayer",
      x: exit.x,
      z: exit.z,
    });
  });

  test("入った家が、家族マップの更新でobjectsから消えても「そとへ でる」で入った場所へ戻る（CodeRabbitレビュー指摘）", async () => {
    // 置いてある装飾の変化などで持ち場の割り当てが変わり、入った家がobjectsから
    // 消えることがある。buildingIdでの検索が失敗しても、入場時点の座標へ戻せることを確かめる。
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await placeFamilyHouse();
    const familyHouse = await enterFamilyHouse();
    const expectedExit = getBuildingExitPoint(familyHouse);

    await act(() => {
      useMapStore.getState().setFamily([], { familyPendingQuestCount: 0, members: {} });
    });

    await emit({ event: "nearby", id: buildingWithRoute("exit").id });
    await fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: expectedExit.facingY,
      type: "placePlayer",
      x: expectedExit.x,
      z: expectedExit.z,
    });
  });

  test("自分の家に入ったときは、クローゼットがふだんどおり使える", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await placeFamilyHouse();
    await enterOwnHouse();

    await emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });
    await fireEvent.press(screen.getByRole("button", { name: "きがえる" }));

    expect(mockPush).toHaveBeenCalledWith("/wardrobe");
  });
});

describe("接近UI", () => {
  test("接近対象が無いときは「入る」ボタンを表示しない", async () => {
    await render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("nearby イベントで「入る」ボタンが出入りする", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    const [firstBuilding] = sentIntents("setMap")[0].objects.filter(
      (object: any) => object.type === "building",
    );
    await emit({ event: "nearby", id: firstBuilding.id });
    expect(screen.getByRole("button", { name: "入る" })).toBeTruthy();

    await emit({ event: "nearby", id: null });
    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });
});

describe("NPCとの会話", () => {
  /** 送り込まれたマップから最初のNPCを取り出す。 */
  const firstNpc = () =>
    sentIntents("setMap")[0].objects.find((object: any) => object.type === "npc");

  test("NPCに接近すると「はなす」ボタンが出る", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await emit({ event: "nearby", id: firstNpc().id });

    expect(screen.getByRole("button", { name: /はなす/ })).toBeTruthy();
    // 建物用の「入る」は出さない
    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("「はなす」を押すと会話が出て、押すたびに進み、最後で閉じる", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const npc = firstNpc();
    await emit({ event: "nearby", id: npc.id });

    await fireEvent.press(screen.getByRole("button", { name: /はなす/ }));

    // 名前と1行目が出る
    expect(screen.getByText(npc.name)).toBeTruthy();
    const nextButton = () => screen.queryByRole("button", { name: "次の話を見る" });
    expect(nextButton()).toBeTruthy();

    // 最後の行まで送ると「おわり」になり、押すと会話が閉じる
    let guard = 0;
    while (nextButton() && guard < 20) {
      await fireEvent.press(nextButton()!);
      guard += 1;
    }
    await fireEvent.press(screen.getByRole("button", { name: "会話を終わる" }));

    expect(screen.queryByText(npc.name)).toBeNull();
    // 会話が終われば、また話しかけられる
    expect(screen.getByRole("button", { name: /はなす/ })).toBeTruthy();
  });

  test("「とじる」で途中でも会話を閉じられる", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const npc = firstNpc();
    await emit({ event: "nearby", id: npc.id });
    await fireEvent.press(screen.getByRole("button", { name: /はなす/ }));
    expect(screen.getByText(npc.name)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "会話を閉じる" }));

    expect(screen.queryByText(npc.name)).toBeNull();
  });

  test("NPCのタップ（talkイベント）でも会話が開く", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const npc = firstNpc();

    // 接近していなくても、タップで話しかけられる
    await emit({ event: "talk", id: npc.id });

    expect(screen.getByText(npc.name)).toBeTruthy();
  });

  test("知らないidのtalkイベントでは何も起きない", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await emit({ event: "talk", id: "npc-does-not-exist" });

    expect(screen.queryByRole("button", { name: "会話を閉じる" })).toBeNull();
  });

  describe("家族のNPC（Issue #255）", () => {
    /** 家族を町に立たせる。取得（useFamilyTown）を通さず、ストアへ直接入れる。 */
    const placeFamily = async () => {
      await act(() => {
        useMapStore.getState().setFamily(
          buildFamilyNpcs([{ characterType: "frog", equipment: {}, id: "kid-1", name: "たろう", palette: {} }], "user-parent-1"),
          {
            familyPendingQuestCount: 1,
            members: {
              "kid-1": { acceptedQuestCount: 0, balance: 30, pendingQuestCount: 1, role: "child" },
            },
          },
        );
      });
    };

    afterEach(async () => {
      await act(() => {
        useMapStore.getState().setFamily([], { familyPendingQuestCount: 0, members: {} });
      });
    });

    test("家族が立つと、マップを送り直す", async () => {
      await render(<RpgHubScreen />);
      await emit({ event: "ready" });
      mockSendIntent.mockClear();

      await placeFamily();

      const npcs = sentIntents("setMap").at(-1).objects.filter((object: any) => object.type === "npc");
      expect(npcs.some((npc: any) => npc.familyMemberId === "kid-1")).toBe(true);
    });

    test("家族のNPCは、その人の状況と、話しかけた人のロールから会話を組み立てる", async () => {
      loginAsParent();
      await render(<RpgHubScreen />);
      await emit({ event: "ready" });
      await placeFamily();

      await emit({ event: "talk", id: "npc-family-kid-1" });

      expect(screen.getByText("たろう")).toBeTruthy();
      let guard = 0;
      while (!screen.queryByText("たしかめて くれると うれしいな！") && guard < 5) {
        await fireEvent.press(screen.getByRole("button", { name: "次の話を見る" }));
        guard += 1;
      }
      expect(screen.getByText("たしかめて くれると うれしいな！")).toBeTruthy();
    });

    test("状況だけが変わっても、マップは送り直さない", async () => {
      await render(<RpgHubScreen />);
      await emit({ event: "ready" });
      await placeFamily();
      mockSendIntent.mockClear();

      await act(() => {
        const state = useMapStore.getState();
        state.setFamily(state.familyNpcs, { familyPendingQuestCount: 0, members: {} });
      });

      expect(sentIntents("setMap")).toHaveLength(0);
    });
  });

  test("会話中は移動の入力を止め、閉じたら戻す", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    const npc = firstNpc();
    mockSendIntent.mockClear();

    await emit({ event: "talk", id: npc.id });
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });

    await fireEvent.press(screen.getByRole("button", { name: "会話を閉じる" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: true,
      type: "setInputEnabled",
    });
  });

  test("会話中にWebViewが再ロードされても、移動の入力は止まったまま", async () => {
    // 再生成されたシーンは入力受付が既定で有効。会話中なら送り直して止め直す
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await emit({ event: "talk", id: firstNpc().id });
    mockSendIntent.mockClear();

    await emit({ event: "ready" });

    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });
});

describe("エラー表示", () => {
  test("家の中でエラー後に再読み込みしたら、直前の位置を復元せず初期位置から再開する", async () => {
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });
    await emit({ direction: "up", event: "position", facingY: 1.2, ...HOUSE_PLAYER });
    await fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    await act(() => { mockHandlers.onLoadError?.("net::ERR_FAILED"); });
    await fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    mockSendIntent.mockClear();

    await emit({ direction: "up", event: "position", facingY: 0, x: 0, z: 0 });
    expect(screen.getByRole("button", { name: "家の外に出る" })).toBeTruthy();
    await emit({ event: "ready" });

    expect(sentIntents("placePlayer")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "家の外に出る" })).toBeNull();
    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("シーンのエラーを画面に出し、再読み込みで消える", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    await emit({ event: "error", message: "WebGL が初期化できません" });

    expect(screen.getByText("WebGL が初期化できません")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));

    expect(screen.queryByText("WebGL が初期化できません")).toBeNull();
    warnSpy.mockRestore();
  });

  test("WebView のロード失敗も画面に出る", async () => {
    await render(<RpgHubScreen />);

    await act(() => {
      mockHandlers.onLoadError?.("net::ERR_FAILED");
    });

    expect(screen.getByText("net::ERR_FAILED")).toBeTruthy();
  });
});

describe("子供ごとに使わないにした機能（Issue #348）", () => {
  const loginAsChild = () =>
    useAppStore.setState({
      user: { balance: 0, created_at: "2026-07-01T00:00:00Z", id: "user-child-1", name: "たろう", role: "child" },
    });

  test("銀行を使わない子供は、銀行に入れず、しまっていると伝えられる", async () => {
    loginAsChild();
    mockFeatureRestrictions = [{ feature: "bank", user_id: "user-child-1" }];
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(mockPush).not.toHaveBeenCalled();
    expect(useTravelStore.getState().travel).toBeNull();
    expect(screen.getByLabelText("銀行は いま しまっているよ。")).toBeTruthy();
  });

  test("ほかの建物と、銀行を使える子供はこれまでどおり入れる", async () => {
    loginAsChild();
    mockFeatureRestrictions = [{ feature: "bank", user_id: "user-child-2" }];
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute("bank", "child"));
  });

  test("案内の途中なら、入れない銀行の手順を飛ばす", async () => {
    loginAsChild();
    mockFeatureRestrictions = [{ feature: "bank", user_id: "user-child-1" }];
    const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "town-bank") };
    await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(tutorial.advance).toHaveBeenCalledWith("town-bank");
    expect(tutorial.advance).toHaveBeenCalledWith("child-bank-back");
  });

  test("使えるかを読み込んでいる間は入れず、案内も進めない（分からないときは閉じる）", async () => {
    loginAsChild();
    mockFeatureHasData = false;
    const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "town-bank") };
    await render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText("銀行を じゅんびしているよ。")).toBeTruthy();
    expect(tutorial.advance).not.toHaveBeenCalled();
  });

  test("使えるか読み込めなかったときは入れず、取り直す", async () => {
    loginAsChild();
    mockFeatureHasData = false;
    mockFeatureError = "取得できませんでした";
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText("銀行が つかえるか たしかめられなかったよ。")).toBeTruthy();
    expect(mockReloadFeatures).toHaveBeenCalledTimes(1);
  });

  test("読み込めていなくても、ほかの建物には入れる", async () => {
    loginAsChild();
    mockFeatureHasData = false;
    mockFeatureError = "取得できませんでした";
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await enterAtDoor("store");

    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute("store", "child"));
  });

  test("親には制限がかからない", async () => {
    loginAsParent();
    mockFeatureRestrictions = [{ feature: "bank", user_id: "user-parent-1" }];
    await render(<RpgHubScreen />);
    await emit({ event: "ready" });

    await enterAtDoor("bank");

    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute("bank", "parent"));
  });
});

describe("描画負荷の計測（Issue #200）", () => {
  // 計測の表示は読み上げの邪魔にならないよう隠してあるので、隠れた要素も含めて探す
  const HIDDEN = { includeHiddenElements: true };

  // 普段の起動では出さず、`npm run start:perf`（EXPO_PUBLIC_SHOW_PERF=1）のときだけ出す（Issue #507）
  beforeEach(() => {
    mockShowHubPerf = true;
  });

  test("EXPO_PUBLIC_SHOW_PERF を付けずに起動したら、開発ビルドでも計測も表示もしない（Issue #507）", async () => {
    mockShowHubPerf = false;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    await emit({ event: "ready" });

    expect(sentIntents("setPerfStats")).toHaveLength(0);
    expect(screen.queryByTestId("hub-perf-overlay", HIDDEN)).toBeNull();
    expect(logSpy.mock.calls.some(([message]) => String(message).startsWith("[rpg-hub perf]"))).toBe(false);
    logSpy.mockRestore();
  });

  test("EXPO_PUBLIC_SHOW_PERF=1 の開発ビルドでは、シーンの準備ができたら計測を始め、届いた値と起動時間を隅に出す", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    // ready の前は計測を頼まず、何も出さない
    expect(sentIntents("setPerfStats")).toHaveLength(0);
    expect(screen.queryByTestId("hub-perf-overlay", HIDDEN)).toBeNull();
    await emit({ event: "ready" });
    expect(sentIntents("setPerfStats")).toEqual([{ enabled: true, type: "setPerfStats" }]);
    expect(screen.getByTestId("hub-perf-overlay", HIDDEN)).toBeTruthy();
    expect(screen.getByText("計測中…", HIDDEN)).toBeTruthy();

    const rendersBeforeStats = mockHandlers.renders;
    await emit({
      activeMeshes: 225,
      drawCalls: 350,
      event: "perfStats",
      fps: 59.8,
      frameMsAvg: 16.7,
      frameMsP95: 18.2,
      heapMb: null,
      instances: 1671,
      meshes: 261,
      objects: 326,
    });
    expect(screen.getByText("59.8fps 平均16.7ms p95 18.2ms", HIDDEN)).toBeTruthy();
    expect(screen.getByText("draw 350 / 描画中 225", HIDDEN)).toBeTruthy();
    expect(screen.getByText(/^起動 \d+ms$/, HIDDEN)).toBeTruthy();
    // 値が届いても描き直すのは表示だけで、ハブ画面全体は描き直さない（計測そのものが FPS を下げないように）
    expect(mockHandlers.renders).toBe(rendersBeforeStats);
    // 実機で測った値を書き写せるよう、ログにも出す
    expect(logSpy).toHaveBeenCalledWith("[rpg-hub perf]", expect.stringContaining('"drawCalls":350'));
    logSpy.mockRestore();
  });

  test("シーンを作り直したら、もう一度計測を頼む（起動時間は最初の1回のまま）", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    await emit({ event: "ready" });
    await emit({ event: "ready" });

    expect(sentIntents("setPerfStats")).toHaveLength(2);
    expect(logSpy.mock.calls.filter(([message]) => String(message).startsWith("[rpg-hub perf] 起動"))).toHaveLength(1);
    logSpy.mockRestore();
  });

  test("シーンがエラーになったら、計測の表示を消す", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await render(<RpgHubScreen />);

    await emit({ event: "ready" });
    expect(screen.getByTestId("hub-perf-overlay", HIDDEN)).toBeTruthy();
    await emit({ event: "error", message: "壊れました" });

    expect(screen.queryByTestId("hub-perf-overlay", HIDDEN)).toBeNull();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
