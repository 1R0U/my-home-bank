import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
jest.mock("../lib/useOwnedStoreAssets", () => ({
  useOwnedStoreAssets: () => ({
    data: mockOwnedAssets, loading: mockOwnedLoading, error: null, reload: mockReloadOwnedAssets,
  }),
}));
/** WebView ラッパに渡されたコールバックを、テストから発火させるために保持する。 */
const mockHandlers: {
  onEvent?: (event: unknown) => void;
  onLoadError?: (message: string) => void;
  /** 描き直された回数。ハブ画面全体が描き直されたかを見るのに使う */
  renders: number;
} = { renders: 0 };

jest.mock("expo-router", () => ({
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  useFocusEffect: (effect: () => void | (() => void)) => mockUseFocusEffect(effect),
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
  const { forwardRef, useImperativeHandle } = require("react");
  return {
    RpgHubWebView: forwardRef((props: any, ref: any) => {
      mockHandlers.onEvent = props.onEvent;
      mockHandlers.onLoadError = props.onLoadError;
      mockHandlers.renders += 1;
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

// GestureHandlerRootView はマウント時にネイティブモジュールの install() を呼び、
// テスト環境では失敗する（tests/rootLayout.render.test.tsx と同じ対応）。
// Gesture / GestureDetector（ZoomableMap.tsx が使う）はそのまま残す。
jest.mock("react-native-gesture-handler", () => {
  const actual = jest.requireActual<typeof import("react-native-gesture-handler")>(
    "react-native-gesture-handler",
  );
  return {
    ...actual,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

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
import { resolveMapRoute } from "../lib/rpg-hub/routes";
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
const emit = (event: unknown) => {
  act(() => {
    mockHandlers.onEvent?.(event);
  });
};

/**
 * 別の画面から戻ってきて、この画面にフォーカスが戻ったときの処理を流す。
 * useFocusEffect に渡された処理を、同じものは1回ずつ呼ぶ。
 */
const refocus = () => {
  const effects = new Set(mockUseFocusEffect.mock.calls.map(([effect]) => effect));
  act(() => {
    for (const effect of effects) effect();
  });
};

/** 送信された意図のうち、指定した type のものを集める。 */
const sentIntents = (type: string) =>
  mockSendIntent.mock.calls.map(([intent]) => intent as any).filter((intent) => intent?.type === type);

function tutorialValue(): TutorialContextValue {
  return { role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child[0], storageError: false,
    home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn() };
}

test("矢印は準備後に現れて移動で向きが変わり、入場や案内の終了で消える", () => {
  const tutorial = tutorialValue();
  const view = render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
  emit({ event: "ready" });
  expect(screen.getByTestId("tutorial-direction").props.pointerEvents).toBe("none");
  const initial = screen.getByTestId("tutorial-direction-arrow").props.style;
  emit({ event: "position", x: 20, z: -10, facingY: 0, direction: "up" });
  expect(screen.getByTestId("tutorial-direction-arrow").props.style).not.toEqual(initial);
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
  emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId("tutorial-direction-arrow").props.style).toEqual(expect.arrayContaining([
    { transform: [{ rotate: "0deg" }] },
  ]));
  fireEvent.press(screen.getByRole("button", { name: "入る" }));
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
  view.rerender(<TutorialContext.Provider value={{ ...tutorial, mode: "idle", step: null }}><RpgHubScreen /></TutorialContext.Provider>);
  refocus();
  expect(screen.queryByTestId("tutorial-direction")).toBeNull();
});

test.each(["board", "history"])("%sの紹介へ直接タップで進め、入口の枠と目的地の矢印も表示する", (route) => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.townRoute === route) };
  render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  emit({ event: "ready" });
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === route);
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId(`tutorial-frame-town-${route}`)).toBeTruthy();
  emit({ event: "navigate", route });
  expect(mockPush).toHaveBeenCalledWith(resolveMapRoute(route as any, "child"));
  expect(tutorial.advance).toHaveBeenCalledWith(`town-${route}`);
});

test("自分の家の紹介は、家をタップすると画面遷移せずに家の中へ入って進む（Issue #444）", () => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "town-house") };
  render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  emit({ event: "ready" });
  const house = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "house");
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  emit({ event: "nearby", id: house.id });
  expect(screen.getByTestId("tutorial-frame-town-house")).toBeTruthy();
  emit({ event: "navigate", route: "house" });
  expect(mockPush).not.toHaveBeenCalled();
  expect(sentIntents("placePlayer")).toHaveLength(1);
  expect(tutorial.advance).toHaveBeenCalledWith("town-house");
});

test("家の中の紹介は玄関を矢印で示して囲み、「そとへ でる」で町へ戻ると進む（Issue #444）", () => {
  const tutorial = { ...tutorialValue(), step: TUTORIAL_STEPS.child.find((step) => step.id === "child-house-back") };
  render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  emit({ event: "ready" });
  const objects = useMapStore.getState().objects;
  const door = objects.find((object) => object.type === "building" && object.route === "exit");
  const house = objects.find((object) => object.type === "building" && object.route === "house");
  expect(screen.getByTestId("tutorial-direction")).toBeTruthy();
  // クローゼットの前では囲まない
  emit({ event: "nearby", id: objects.find((object) => object.type === "building" && object.route === "wardrobe").id });
  expect(screen.queryByTestId("tutorial-frame-child-house-back")).toBeNull();
  emit({ event: "nearby", id: door.id });
  expect(screen.getByTestId("tutorial-frame-child-house-back")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));
  const townExit = getBuildingExitPoint(house as any);
  expect(sentIntents("placePlayer")).toContainEqual({ facingY: townExit.facingY, type: "placePlayer", x: townExit.x, z: townExit.z });
  expect(tutorial.advance).toHaveBeenCalledWith("child-house-back");
});

test("子供の案内は目的の建物の入口を囲み、実際の入場で進む", () => {
  const tutorial = tutorialValue();
  render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  emit({ event: "ready" });
  const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
  emit({ event: "nearby", id: building.id });
  expect(screen.getByTestId("tutorial-frame-town-tasks")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "入る" }));
  expect(mockPush).toHaveBeenCalledWith("/tasks-child");
  expect(tutorial.advance).toHaveBeenCalledWith("town-tasks");
});

test("建物の直接タップでも案内が進み、遷移に失敗したときは進まない", () => {
  const tutorial = tutorialValue();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    mockPush.mockImplementationOnce(() => { throw new Error("遷移失敗"); });
    render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
    emit({ event: "navigate", route: "tasks" });
    expect(tutorial.advance).not.toHaveBeenCalled();
    emit({ event: "navigate", route: "tasks" });
    expect(tutorial.advance).toHaveBeenCalledWith("town-tasks");
  } finally { warn.mockRestore(); }
});

test("大人の町の紹介はホームへ戻るボタンで設定の案内へ進む", () => {
  loginAsParent();
  const tutorial = { ...tutorialValue(), role: "parent" as const, step: TUTORIAL_STEPS.parent.find((step) => step.id === "parent-town-back") };
  render(<TutorialContext.Provider value={tutorial}><RpgHubScreen /></TutorialContext.Provider>);
  emit({ event: "ready" });
  expect(screen.getByTestId("tutorial-frame-parent-town-back")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(tutorial.advance).toHaveBeenCalledWith("parent-town-back");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnedAssets = getPlaceableDecorations().map((asset_id) => ({ asset_id, quantity: 1 }));
  mockOwnedLoading = false;
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
  useTravelStore.setState({ travel: null });
});

describe("読み込み中の画面（Issue #261）", () => {
  test("シーンの準備ができるまで「いどうちゅう」の画面を重ね、ready で外す", () => {
    render(<RpgHubScreen />);
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();

    emit({ event: "ready" });

    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
  });

  test("歩く姿のコマ絵は、シーンの準備ができてから裏で描く（3Dを同時に2つ立ち上げない）", () => {
    render(<RpgHubScreen />);
    expect(screen.queryByTestId("mock-walk-frames-preparer")).toBeNull();

    emit({ event: "ready" });

    expect(screen.getByTestId("mock-walk-frames-preparer")).toBeTruthy();
  });

  test("ready も error も来ないまま止まったら、一定時間で重ねるのをやめ、再読み込みのボタンを見せる", () => {
    jest.useFakeTimers();
    try {
      render(<RpgHubScreen />);

      act(() => jest.advanceTimersByTime(SCENE_LOAD_TIMEOUT_MS - 1));
      expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();

      act(() => jest.advanceTimersByTime(1));
      expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
      expect(screen.getByRole("button", { name: "マップを再読み込みする" })).toBeTruthy();

      // 遅れて ready が届いたら、エラーは消える
      emit({ event: "ready" });
      expect(screen.queryByRole("button", { name: "マップを再読み込みする" })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("準備に失敗したら重ねず、エラーと再読み込みのボタンを見せる。再読み込みするとまた重ねる", () => {
    render(<RpgHubScreen />);

    act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });

    expect(screen.queryByTestId("mock-travel-loading-overlay")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    expect(screen.getByTestId("mock-travel-loading-overlay")).toBeTruthy();
  });

  test("設定を開くときは、建物へ入るのではないので移動を始めない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    pressMenuItem("設定を開く");
    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("navigate イベントで建物へ入ると、移動を始める", () => {
    render(<RpgHubScreen />);

    emit({ event: "navigate", id: "bank-building", route: "bank" });

    expect(useTravelStore.getState().travel).not.toBeNull();
  });

  test("建物から戻ってきたら「いどうちゅう」を始め、扉の前へ立たせ直したら閉じてよいと知らせる", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    emit({ event: "navigate", id: "bank-building", route: "bank" });
    const enterTravelId = useTravelStore.getState().travel?.id;
    mockSendIntent.mockClear();

    refocus();

    const travel = useTravelStore.getState().travel;
    // 入るときの移動とは別の、戻るときの移動になっている
    expect(travel).not.toBeNull();
    expect(travel?.id).not.toBe(enterTravelId);
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(travel?.waiting).toBe(false);
  });

  test("シーンの準備ができる前に戻ってきたら、立たせ直せるまで読み込み中のままにする", () => {
    render(<RpgHubScreen />);
    emit({ event: "navigate", id: "bank-building", route: "bank" });

    refocus();
    expect(useTravelStore.getState().travel?.waiting).toBe(true);

    emit({ event: "ready" });
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(useTravelStore.getState().travel?.waiting).toBe(false);
  });

  test("再読み込みした WebView の ready が届くまでは、扉の前へ立たせず読み込み中のままにする", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    emit({ event: "navigate", id: "bank-building", route: "bank" });
    // 建物にいる間にシーンが壊れ、再読み込みした（sceneGeneration は0へ戻らない）
    act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });
    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    mockSendIntent.mockClear();

    refocus();
    expect(sentIntents("placePlayer")).toHaveLength(0);
    expect(useTravelStore.getState().travel?.waiting).toBe(true);

    emit({ event: "ready" });
    expect(sentIntents("placePlayer")).toHaveLength(1);
    expect(useTravelStore.getState().travel?.waiting).toBe(false);
  });

  test("建物にいる間にシーンが壊れていたら、戻ってきたときに重ねず、エラーを見せる", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    emit({ event: "navigate", id: "bank-building", route: "bank" });
    // 建物にいる間に壊れ、再読み込みした WebView も準備できないまま失敗した
    act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });
    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));
    act(() => {
      mockHandlers.onLoadError?.("また読み込めませんでした");
    });

    refocus();

    expect(useTravelStore.getState().travel).toBeNull();
    expect(screen.getByRole("button", { name: "マップを再読み込みする" })).toBeTruthy();
  });

  test("戻ってきたときにシーンが壊れていたら、重ねるのをやめてエラーを見せる", () => {
    render(<RpgHubScreen />);
    emit({ event: "navigate", id: "bank-building", route: "bank" });
    refocus();

    act(() => {
      mockHandlers.onLoadError?.("読み込めませんでした");
    });

    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("建物以外（設定など）から戻ってきたときは、移動を始めない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    pressMenuItem("設定を開く");

    refocus();

    expect(useTravelStore.getState().travel).toBeNull();
  });

  test("建物への遷移に失敗したら、移動をやめる", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockPush.mockImplementation(() => {
      throw new Error("遷移できません");
    });
    render(<RpgHubScreen />);

    emit({ event: "navigate", id: "bank-building", route: "bank" });

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
const putPlaced = (assetId: string, point: { x: number; z: number }, id: string) => {
  const object = { ...createDecorationCandidate(assetId, point), id };
  act(() => {
    useMapStore.getState().setPlacedDecorations([...useMapStore.getState().placedDecorations, object]);
  });
  return object;
};

/** 家の中に立って、かざるの編集モードを始める */
const startEditingInHouse = () => {
  render(<RpgHubScreen />);
  emit({ event: "ready" });
  emit({ direction: "up", event: "position", facingY: 0, x: HOUSE_PLAYER.x, z: HOUSE_PLAYER.z });
  pressMenuItem("かざるをはじめる");
};

describe("かざるの編集モード（Issue #477）", () => {
  test("始めると映す範囲をシーンへ送り、スティックと住人を止める。「おわる」で元に戻す", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const lastPad = () => mockPadProps.mock.calls.at(-1)?.[0] as any;
    expect(lastPad().disabled).toBe(false);

    pressMenuItem("かざるをはじめる");

    expect(sentIntents("setEditMode").at(-1)?.area).toEqual(getEditArea({ x: 0, z: 0 }));
    expect(lastPad().disabled).toBe(true);
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({ enabled: false, type: "setInputEnabled" });

    fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    expect(sentIntents("setEditMode").at(-1)?.area).toBeNull();
    expect(lastPad().disabled).toBe(false);
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({ enabled: true, type: "setInputEnabled" });
    expect(screen.queryByTestId("decoration-panel")).toBeNull();
  });

  test("「もとに もどす」で、指で変えたズームと移動をやめるようシーンへ伝える", () => {
    startEditingInHouse();

    fireEvent.press(screen.getByRole("button", { name: "みえかたをもとにもどす" }));

    expect(sentIntents("resetEditView")).toEqual([{ type: "resetEditView" }]);
  });

  test("編集中はメニューを出さず、マップも開けない（キャラクターだけ別の場所へ動かさない。CodeRabbitレビュー指摘）", () => {
    startEditingInHouse();

    expect(screen.queryByRole("button", { name: "メニューを開く" })).toBeNull();
    const map = screen.getByRole("button", { name: "マップを開く" });
    expect(map.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(map);
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
  });

  test("家の中で始めると、部屋全体を映す。パネルが隠す高さも伝える", () => {
    startEditingInHouse();

    expect(sentIntents("setEditMode").at(-1)?.area).toEqual(getEditArea(HOUSE_PLAYER));

    fireEvent(screen.getByTestId("decoration-panel"), "layout", {
      nativeEvent: { layout: { height: 288, width: 360, x: 0, y: 0 } },
    });
    // パネルの高さに、下のすき間（12）を足した分
    expect(sentIntents("setEditMode").at(-1)?.insets.bottom).toBe(300);
  });

  test("持ち物の取得中に始めても、取得後に一覧へ並ぶ", () => {
    mockOwnedAssets = [];
    mockOwnedLoading = true;
    const { rerender } = render(<RpgHubScreen />);
    emit({ event: "ready" });
    pressMenuItem("かざるをはじめる");
    expect(mockReloadOwnedAssets).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ストアの「かざり」の棚で買うと使えるよ")).toBeTruthy();

    mockOwnedAssets = [{ asset_id: "decoration-lamp", quantity: 2 }];
    mockOwnedLoading = false;
    rerender(<RpgHubScreen />);
    expect(screen.getByRole("button", { name: "ランプ　あと2こ" })).toBeTruthy();
  });

  test("編集中は、建物に近づいても「入る」ボタンを出さない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const building = useMapStore.getState().objects.find((object) => object.type === "building" && object.route === "tasks");
    emit({ event: "nearby", id: building.id });
    expect(screen.getByRole("button", { name: "入る" })).toBeTruthy();

    pressMenuItem("かざるをはじめる");

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("置いた装飾をタップすると選び、「まわす」で90度ずつ回す", () => {
    startEditingInHouse();
    const lamp = putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");

    emit({ event: "editTap", id: lamp.id });

    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: lamp.id, type: "setEditSelection" });
    fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));
    expect(mockUpdate).toHaveBeenCalledWith(lamp.id, { rotationY: Math.PI / 2 });
  });

  test("選んだ装飾を「しまう」と、その装飾をしまう", () => {
    startEditingInHouse();
    const lamp = putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    emit({ event: "editTap", id: lamp.id });

    fireEvent.press(screen.getByRole("button", { name: "えらんだかざりをしまう" }));

    expect(mockRemove).toHaveBeenCalledWith(lamp.id);
  });

  test("何も無い所をタップしたり「やめる」を押したりすると、選ぶのをやめる", () => {
    startEditingInHouse();
    const lamp = putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    emit({ event: "editTap", id: lamp.id });

    emit({ event: "editTap", id: null });
    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: null, type: "setEditSelection" });
    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();

    emit({ event: "editTap", id: lamp.id });
    fireEvent.press(screen.getByRole("button", { name: "えらぶのをやめる" }));
    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();
  });

  test("町の固定物をタップしても選ばない", () => {
    startEditingInHouse();
    const fixed = useMapStore.getState().objects.find((object) => object.type === "decoration");

    emit({ event: "editTap", id: fixed.id });

    expect(screen.queryByRole("button", { name: "むきをまわす" })).toBeNull();
  });

  test("一覧から引っぱってきた装飾を、置けるマスに下ろすと置く", () => {
    startEditingInHouse();
    const snapped = createDecorationCandidate("decoration-lamp", HOUSE_FREE_POINT);

    emit({ assetId: "decoration-lamp", event: "editDrop", id: null, x: snapped.position.x, z: snapped.position.z });

    expect(mockPlace).toHaveBeenCalledWith({
      assetId: "decoration-lamp",
      rotationY: 0,
      scale: 1,
      x: snapped.position.x,
      z: snapped.position.z,
    });
  });

  test("置けないマスに下ろすと理由を出し、置かない", () => {
    startEditingInHouse();
    const rock = putPlaced("decoration-rock", HOUSE_FREE_POINT, "placed-rock");

    emit({ assetId: "decoration-lamp", event: "editDrop", id: null, x: rock.position.x, z: rock.position.z });

    expect(mockPlace).not.toHaveBeenCalled();
    expect(screen.getByText("ここには おけません")).toBeTruthy();
  });

  test("持ち上げて動かした装飾を、置けるマスに下ろすと動かす", () => {
    startEditingInHouse();
    const lamp = putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    const target = createDecorationCandidate("decoration-lamp", { x: HOUSE_FREE_POINT.x, z: HOUSE_FREE_POINT.z - 0.9 });

    emit({ event: "editLift", id: lamp.id });
    emit({ assetId: "decoration-lamp", event: "editDrop", id: lamp.id, x: target.position.x, z: target.position.z });

    expect(mockUpdate).toHaveBeenCalledWith(lamp.id, { x: target.position.x, z: target.position.z });
  });

  test("クローゼットをタップすると選べ、「しまう」は出さずに「まわす」で回せる", () => {
    startEditingInHouse();

    emit({ event: "editTap", id: "house-closet" });

    expect(sentIntents("setEditSelection").at(-1)).toEqual({ id: "house-closet", type: "setEditSelection" });
    expect(screen.getByText("かざる ▸ クローゼット")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "えらんだかざりをしまう" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    // 実データを使わない（未ログイン）ときは、画面の中だけで動かす
    const layout = useMapStore.getState().furnitureLayouts.find((item) => item.furnitureId === "house-closet");
    expect(layout?.rotationY).toBeCloseTo(Math.PI / 2);
    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(closet?.rotationY).toBeCloseTo(Math.PI / 2);
  });

  test("奥の壁ぎわでは、正面が壁を向く向きを飛ばして回す（0度と90度を行き来し、位置もずれない）", () => {
    startEditingInHouse();
    const start = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    emit({ event: "editTap", id: "house-closet" });

    fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));
    fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(closet.rotationY ?? 0).toBeCloseTo(0);
    expect(closet.position.x).toBeCloseTo(start.position.x);
    expect(closet.position.z).toBeCloseTo(start.position.z);
    expect(screen.queryByText("ここでは まわせません")).toBeNull();
  });

  test("クローゼットを持ち上げて、空いているマスに下ろすと動く", () => {
    startEditingInHouse();
    const before = useMapStore.getState().objects.find((object) => object.id === "house-closet");

    emit({ event: "editLift", id: "house-closet" });
    emit({ assetId: before.model, event: "editDrop", id: "house-closet", x: HOUSE_FREE_POINT.x, z: HOUSE_FREE_POINT.z });

    const after = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    expect(after.position.x).not.toBeCloseTo(before.position.x);
    expect(after.position.z).not.toBeCloseTo(before.position.z);
  });

  test("回すと置いた装飾にぶつかるときは、クローゼットを回さない", () => {
    startEditingInHouse();
    // クローゼットは横2 × 奥行き1マス。90度回すと縦長になり、すぐ手前（2行目）のマスまで占める
    const closet = useMapStore.getState().objects.find((object) => object.id === "house-closet");
    const turned = placeFurnitureAt(closet, getFurnitureRotationCenter(closet, Math.PI / 2), Math.PI / 2);
    const cells = getObjectCells(turned);
    putPlaced("decoration-lamp", {
      x: HOUSE_GRID_ORIGIN.x + (cells.col + 0.5) * TOWN_CELL_SIZE,
      z: HOUSE_GRID_ORIGIN.z + (cells.row + cells.rows - 0.5) * TOWN_CELL_SIZE,
    }, "placed-lamp");
    emit({ event: "editTap", id: "house-closet" });

    fireEvent.press(screen.getByRole("button", { name: "むきをまわす" }));

    expect(screen.getByText("ここでは まわせません")).toBeTruthy();
    expect(useMapStore.getState().objects.find((object) => object.id === "house-closet")?.rotationY ?? 0).toBeCloseTo(0);
  });

  test("編集中はキャラクターが立っていたマスにも置ける。終えるとき、そこに物があればキャラクターを玄関へ移す", () => {
    startEditingInHouse();
    // キャラクター（HOUSE_PLAYER）の足元に岩を置く。編集中はキャラクターを消し、玄関に立っているものとして判定する
    const rock = createDecorationCandidate("decoration-rock", HOUSE_PLAYER);
    emit({ assetId: "decoration-rock", event: "editDrop", id: null, x: rock.position.x, z: rock.position.z });
    expect(mockPlace).toHaveBeenCalledWith(expect.objectContaining({ assetId: "decoration-rock" }));

    // 保存が終わって、岩がマップに載った
    putPlaced("decoration-rock", HOUSE_PLAYER, "placed-rock");
    const placeCount = sentIntents("placePlayer").length;
    fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    const door = useMapStore
      .getState()
      .objects.find((object): object is BuildingMapObject => object.type === "building" && object.route === "exit");
    const exit = getBuildingExitPoint(door);
    expect(sentIntents("placePlayer").slice(placeCount)).toEqual([
      { facingY: exit.facingY, type: "placePlayer", x: exit.x, z: exit.z },
    ]);
  });

  test("終えるとき、キャラクターの足元が空いていれば動かさない", () => {
    startEditingInHouse();
    const placeCount = sentIntents("placePlayer").length;

    fireEvent.press(screen.getByRole("button", { name: "かざるのをおわる" }));

    expect(sentIntents("placePlayer").length).toBe(placeCount);
  });

  test("置けないマスへ動かしたら、マップを送り直して見た目を元へ戻す", () => {
    startEditingInHouse();
    const lamp = putPlaced("decoration-lamp", HOUSE_FREE_POINT, "placed-lamp");
    const rock = putPlaced("decoration-rock", { x: HOUSE_FREE_POINT.x + 3, z: HOUSE_FREE_POINT.z }, "placed-rock");
    const setMapCount = sentIntents("setMap").length;

    emit({ assetId: "decoration-lamp", event: "editDrop", id: lamp.id, x: rock.position.x, z: rock.position.z });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sentIntents("setMap").length).toBe(setMapCount + 1);
    expect(screen.getByText("ここには おけません")).toBeTruthy();
  });
});

describe("BGM", () => {
  test("画面のフォーカス中だけ再生し、離れたら停止する", () => {
    render(<RpgHubScreen />);

    let cleanup: (() => void) | undefined;
    const focusEffects = [...mockUseFocusEffect.mock.calls];
    act(() => {
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

    act(() => {
      cleanup?.();
    });
    expect(mockStopBgm).toHaveBeenCalledTimes(1);
  });
});

describe("マップの送り込み", () => {
  test("ready を受け取るとマップと季節を送る", () => {
    render(<RpgHubScreen />);
    expect(sentIntents("setMap")).toHaveLength(0);

    emit({ event: "ready" });

    const intents = sentIntents("setMap");
    expect(intents).toHaveLength(1);
    expect(intents[0].objects.length).toBeGreaterThan(0);
    expect(typeof intents[0].season).toBe("string");
  });

  test("WebView が再ロードして ready を再送したら、マップを送り直す", () => {
    // バックグラウンド復帰などでシーンが作り直されたとき、送り直さないと
    // 建物が無い空のマップのままになる。
    render(<RpgHubScreen />);

    emit({ event: "ready" });
    emit({ event: "ready" });

    expect(sentIntents("setMap")).toHaveLength(2);
  });
});

describe("季節（Issue #282）", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ready を受け取ると、setMap と同じ季節を setSeason でも送る", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    const [map] = sentIntents("setMap");
    expect(sentIntents("setSeason")).toEqual([{ season: map.season, type: "setSeason" }]);
  });

  test("季節が変わったら setSeason だけを送り、マップは送り直さない", () => {
    // setMap を送り直すと、WebView 側が建物や木まで作り直し、住人の立ち位置も初期化される
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const next = useMapStore.getState().currentSeason === "winter" ? "spring" : "winter";

    act(() => {
      useMapStore.setState({ currentSeason: next });
    });

    expect(sentIntents("setMap")).toHaveLength(1);
    expect(sentIntents("setSeason").at(-1)).toEqual({ season: next, type: "setSeason" });
  });

  test("開いたまま季節の変わり目をまたぐと、季節が切り替わる", () => {
    jest.useFakeTimers({ now: new Date(2026, 4, 31, 23, 59, 0) });
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    expect(useMapStore.getState().currentSeason).toBe("spring");

    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(useMapStore.getState().currentSeason).toBe("summer");
    expect(sentIntents("setSeason").at(-1)).toEqual({ season: "summer", type: "setSeason" });
  });
});

describe("プレイヤーの色（Issue #254）", () => {
  test("ready を受け取ると本人の色を送る。未設定なら空（既定の色）", () => {
    render(<RpgHubScreen />);
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);

    emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toEqual([{ palette: {}, type: "setPlayerPalette" }]);
  });

  test("色が変わったら送り直す", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    act(() => {
      useAppearanceStore.getState().setPalette({ skin: "#abcdef" }, null, "frog");
    });

    expect(sentIntents("setPlayerPalette").at(-1)).toEqual({
      palette: { skin: "#abcdef" },
      type: "setPlayerPalette",
    });
  });

  test("WebView が再ロードして ready を再送したら、色も送り直す", () => {
    render(<RpgHubScreen />);
    // 再生成直後のシーンは既定の色に戻っているため。
    // マウント直後は useCharacterPalette（Issue #253）が既定へ戻すため、render後にセットする
    act(() => {
      useAppearanceStore.getState().setPalette({ accent: "#123456" }, null, "frog");
    });

    emit({ event: "ready" });
    emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toHaveLength(2);
    expect(sentIntents("setPlayerPalette")[1].palette).toEqual({ accent: "#123456" });
  });

  test("同じ色を反映し直しても、送り直さない", () => {
    render(<RpgHubScreen />);
    act(() => {
      useAppearanceStore.getState().setPalette({ skin: "#abcdef" }, null, "frog");
    });
    emit({ event: "ready" });
    expect(sentIntents("setPlayerPalette")).toHaveLength(1);

    act(() => {
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

    render(<RpgHubScreen />);

    // 読み込み中は「マップを準備中…」のままで、RpgHubWebViewはまだマウントされない
    expect(mockHandlers.onEvent).toBeUndefined();

    await act(async () => {
      resolveType("cat");
      await Promise.resolve();
      await Promise.resolve();
    });

    // ここでRpgHubWebViewが実際に「ねこ」としてマウントされる
    expect(mockHandlers.onEvent).toBeDefined();
    emit({ event: "ready" });

    expect(sentIntents("setPlayerPalette")).toEqual([
      { palette: { skin: "#abcdef" }, type: "setPlayerPalette" },
    ]);
    expect(mockFetchCharacterPalette).toHaveBeenCalledWith(REAL_USER_ID, "cat");
  });

  test("町を残して種類を変えても、新しい種類の色を古い形へ送らない", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    useAppStore.setState({ user: {
      balance: 0, created_at: "2026-07-01T00:00:00Z", id: userId, name: "テスト", role: "child",
    } });
    mockFetchCharacterPalette.mockImplementation(async (_userId, type) =>
      type === "cat" ? { skin: "#e74c3c" } : { skin: "#4a90e2" },
    );
    const view = render(<RpgHubScreen />);
    await act(async () => undefined);
    emit({ event: "ready" });
    expect(sentIntents("setPlayerPalette").at(-1).palette).toEqual({ skin: "#4a90e2" });
    mockSendIntent.mockClear();

    await act(async () => {
      useAppearanceStore.getState().setCharacterType("cat", userId);
    });
    expect(mockFetchCharacterPalette).toHaveBeenCalledWith(userId, "cat");
    expect(sentIntents("setPlayerPalette")).toHaveLength(0);

    view.unmount();
    mockFetchCharacterType.mockResolvedValue("cat");
    render(<RpgHubScreen />);
    await act(async () => undefined);
    emit({ event: "ready" });
    expect(sentIntents("setPlayerPalette").at(-1).palette).toEqual({ skin: "#e74c3c" });
  });
});

/**
 * 右上のメニューを開いて、中のボタンを押す。
 * @param name - 押すボタンのラベル
 */
function pressMenuItem(name: string) {
  fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
  fireEvent.press(screen.getByRole("button", { name }));
}

describe("大人用の戻るボタン", () => {
  test("子供には出さない（この画面がホームのため）", () => {
    render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "ホームに戻る" })).toBeNull();
  });

  test("大人には出し、押すと前の画面へ戻る", () => {
    loginAsParent();
    render(<RpgHubScreen />);

    fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("戻る先の履歴が無ければ、大人用ホームへ移る", () => {
    mockCanGoBack.mockReturnValue(false);
    loginAsParent();
    render(<RpgHubScreen />);

    fireEvent.press(screen.getByRole("button", { name: "ホームに戻る" }));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/main-adult");
  });
});

describe("右上のメニュー", () => {
  test("ふだんはメニューボタンだけを出し、押すと中のボタンが出る", () => {
    render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.queryByRole("button", { name: "かざるをはじめる" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));

    for (const name of ["キャラクターをえらぶ", "かざるをはじめる", "きがえを開く", "設定を開く"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  test("もう一度押すと閉じる", () => {
    render(<RpgHubScreen />);

    fireEvent.press(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.press(screen.getByRole("button", { name: "メニューを閉じる" }));

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
  });

  test("中のボタンを押すとメニューが閉じる", () => {
    render(<RpgHubScreen />);

    pressMenuItem("かざるをはじめる");

    expect(screen.queryByRole("button", { name: "設定を開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "かざるのをおわる" })).toBeTruthy();
  });
});

describe("画面遷移", () => {
  test("iOS の戻るスワイプは画面の左端からだけにする（Issue #371）", () => {
    render(<RpgHubScreen />);

    // iOS 26 からは画面のどこからでも戻るスワイプが効くため、キャラクターを右へ動かすと
    // ホームへ戻されてしまう。明示的に切っておく。
    // toHaveBeenCalledWith だと過去のどれか1回が一致すれば通ってしまうため、
    // 最後に描かれた options を確かめる（1R0Uレビュー対応）
    const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
    expect(lastProps?.options).toEqual(expect.objectContaining({ fullScreenGestureEnabled: false }));
  });

  test("ナビゲーションの見出し（rpg-hub の白い帯）を出さない", () => {
    render(<RpgHubScreen />);

    const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
    expect(lastProps?.options).toEqual(expect.objectContaining({ headerShown: false }));
  });

  test("設定ボタンからの遷移でも WebView の入力を止める", () => {
    render(<RpgHubScreen />);

    pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledWith("/settings-child");
    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });

  test("大人が設定ボタンを押すと、大人用の設定画面を開く（Issue #439）", () => {
    loginAsParent();
    render(<RpgHubScreen />);

    pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledWith("/settings-adult");
  });

  test("設定ボタンを連打しても1回しか遷移しない", () => {
    render(<RpgHubScreen />);

    // 押すとメニューが閉じるので、2回目は開き直してから押す
    pressMenuItem("設定を開く");
    pressMenuItem("設定を開く");

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("遷移に失敗したら入力を戻して再操作できる", () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    pressMenuItem("設定を開く");

    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: true,
      type: "setInputEnabled",
    });

    pressMenuItem("設定を開く");
    expect(mockPush).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  test("navigate イベントを受け取ると対応する画面へ遷移する", () => {
    render(<RpgHubScreen />);

    emit({ event: "navigate", id: "bank-building", route: "bank" });

    expect(mockPush).toHaveBeenCalledWith("/bank-child");
  });

  test("接近中に「入る」を押すと対象の建物の画面へ遷移する", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    const [building] = sentIntents("setMap")[0].objects.filter(
      (object: any) => object.type === "building",
    );
    emit({ event: "nearby", id: building.id });

    fireEvent.press(screen.getByRole("button", { name: "入る" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute(building.route, undefined));
  });

  test("大人が入っているときは、建物の行き先が大人用の画面になる", () => {
    // Issue #247: 子供用タスク画面は「自分が子供として報告する」画面なので、
    // 大人がそのまま入ると意味がねじれる
    loginAsParent();
    render(<RpgHubScreen />);

    emit({ event: "navigate", id: "tasks-building", route: "tasks" });

    expect(mockPush).toHaveBeenCalledWith("/tasks-adult");
  });

  test("navigate イベントが commit を挟まず連続で届いても1回しか遷移しない", () => {
    // 遷移ロックを state で判定していると、同じ描画のクロージャが 2 回とも
    // ロック解除前の値を読んで多重に router.push してしまう。
    render(<RpgHubScreen />);

    act(() => {
      mockHandlers.onEvent?.({ event: "navigate", id: "bank-building", route: "bank" });
      mockHandlers.onEvent?.({ event: "navigate", id: "store-building", route: "store" });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/bank-child");
  });
});

describe("マップ表示（Issue #314）", () => {
  test("マップを開くと全体マップが表示され、とじるボタンで閉じる", () => {
    render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    expect(screen.getByRole("button", { name: "マップを閉じる" })).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "マップを閉じる" }));
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();
  });

  test("マップを開いても画面遷移やWebViewへの意図送信は起きない", () => {
    render(<RpgHubScreen />);

    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSendIntent).not.toHaveBeenCalled();
  });

  test("マップを開いている間はキャラクターの移動入力を止め、閉じたら戻す", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    mockSendIntent.mockClear();

    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });

    fireEvent.press(screen.getByRole("button", { name: "マップを閉じる" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: true,
      type: "setInputEnabled",
    });
  });
});

describe("マップから建物へワープ（Issue #406）", () => {
  /** マップを開き、建物アイコンをタップして確認を出し、「ワープする」を押すところまで。 */
  function warpTo(label: string) {
    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    fireEvent.press(screen.getByRole("button", { name: `${label}へワープ` }));
    fireEvent.press(screen.getByRole("button", { name: "ワープする" }));
  }

  test("建物アイコンをタップすると、いきなり遷移せず確認を出す", () => {
    // 誤タップでいきなり画面が変わらないようにするため（ユーザー要望）。
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    fireEvent.press(screen.getByRole("button", { name: `${BUILDING_MAP_LABELS.bank}へワープ` }));

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

  test("確認で「やめる」を押すと、遷移せずマップの表示に戻る", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    fireEvent.press(screen.getByRole("button", { name: "マップを開く" }));
    fireEvent.press(screen.getByRole("button", { name: `${BUILDING_MAP_LABELS.bank}へワープ` }));
    fireEvent.press(screen.getByRole("button", { name: "やめる" }));

    expect(mockPush).not.toHaveBeenCalled();
    // マップ自体は開いたまま（とじるボタンが見える）
    expect(screen.getByRole("button", { name: "マップを閉じる" })).toBeTruthy();
  });

  test("確認で「ワープする」を押すと、enterBuilding()を通って遷移し、マップが閉じる", () => {
    // 1R0Uさんレビュー指摘：以前はnavigate()を直接呼んでおり、歩いて入るときと違って
    // 「いどうちゅう」の画面（startTravel）が出なかった。enterBuilding()を通ることを確かめる。
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    warpTo(BUILDING_MAP_LABELS.bank);

    expect(mockPush).toHaveBeenCalledWith(resolveMapRoute("bank", undefined));
    expect(useTravelStore.getState().travel).not.toBeNull();
    expect(screen.queryByRole("button", { name: "マップを閉じる" })).toBeNull();
  });

  test("遷移中（ロック中）に別の建物をタップしても、戻ったときは最初にワープした建物の扉の前に立つ", () => {
    // enterBuilding()の連打防止（navigationLockedRef）により、2件目のタップは無視される。
    // enteredBuildingIdRefが書き換わっていないことを、戻ってきたときのテレポート先で確かめる
    // （1R0Uさんレビュー指摘）。
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    const buildings = sentIntents("setMap")[0].objects.filter((object: any) => object.type === "building");
    const bank = buildings.find((building: any) => building.route === "bank");
    const store = buildings.find((building: any) => building.route === "store");

    warpTo(BUILDING_MAP_LABELS.bank);
    expect(mockPush).toHaveBeenCalledTimes(1);

    // ロック中。マップは既に閉じているので、もう一度開いてから別の建物を押す。
    warpTo(BUILDING_MAP_LABELS.store);
    expect(mockPush).toHaveBeenCalledTimes(1); // 2件目は無視される

    mockSendIntent.mockClear();
    act(() => {
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

  test("自分の家をタップすると、画面遷移せずに家の中の玄関の前へテレポートし、マップが閉じる", () => {
    // 自分の家の中は町と同じシーンの中にあり、テレポートで入る（Issue #444）。
    // マップからのワープも、歩いて入るときと同じ分岐を通ることを確かめる。
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    warpTo(BUILDING_MAP_LABELS.house);

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

  test("常時表示のミニマップでは建物アイコンをタップできない（タップで全体マップが開くだけ）", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

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
  test("家の中の玄関に近づくと「そとへ でる」が出て、押すと町の家の前へテレポートする", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    emit({ event: "nearby", id: buildingWithRoute("exit").id });
    fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    const townExit = getBuildingExitPoint(buildingWithRoute("house"));
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: townExit.facingY,
      type: "placePlayer",
      x: townExit.x,
      z: townExit.z,
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("クローゼットに近づくと「きがえる」が出て、押すときがえの画面へ行く", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });
    fireEvent.press(screen.getByRole("button", { name: "きがえる" }));

    expect(mockPush).toHaveBeenCalledWith("/wardrobe");
  });
});

describe("家族一人ひとりの家（Issue #244）", () => {
  /** 家族の家（houseOwnerId付き）を町に立たせる。取得（useFamilyTown）を通さず、ストアへ直接入れる。 */
  const placeFamilyHouse = () => {
    act(() => {
      useMapStore.getState().setFamily(
        buildFamilyHouses([{ id: "member-1" }], "user-parent-1"),
        { familyPendingQuestCount: 0, members: {} },
      );
    });
  };

  afterEach(() => {
    act(() => {
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
  const enterOwnHouse = () => {
    const ownHouse = buildingWithRoute("house");
    emit({ event: "navigate", id: ownHouse.id, route: "house" });
    emit({ event: "position", facingY: 0, x: 0, z: -76 });
  };

  /** 家族の家の外から、家の中へテレポートする。 */
  const enterFamilyHouse = () => {
    const familyHouse = familyHouseBuilding();
    emit({ event: "navigate", id: familyHouse.id, route: "house" });
    // 中は共有の1部屋。プレイヤーの実座標がその中へ入ったことにして、実際の見え方に合わせる
    // （houseLocation はプレイヤーの実座標から導く。RpgHubScreen.tsx の houseLocation 参照）。
    emit({ event: "position", facingY: 0, x: 0, z: -76 });
    return familyHouse;
  };

  test("他の家族の家に入ると、中のクローゼットに近づいても「きがえる」ボタンが出ない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    placeFamilyHouse();
    enterFamilyHouse();

    emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });

    expect(screen.queryByRole("button", { name: "きがえる" })).toBeNull();
  });

  test("他の家族の家の中でクローゼットを直接タップしても、きがえ画面へ遷移しない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    placeFamilyHouse();
    enterFamilyHouse();

    const closet = buildingWithRoute("wardrobe");
    emit({ event: "navigate", id: closet.id, route: "wardrobe" });

    expect(mockPush).not.toHaveBeenCalledWith("/wardrobe");
  });

  test("他の家族の家の中でも「そとへ でる」は使え、その家の前（自分の家ではない）へ戻る", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    placeFamilyHouse();
    const familyHouse = enterFamilyHouse();

    emit({ event: "nearby", id: buildingWithRoute("exit").id });
    fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    const exit = getBuildingExitPoint(familyHouse);
    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: exit.facingY,
      type: "placePlayer",
      x: exit.x,
      z: exit.z,
    });
  });

  test("入った家が、家族マップの更新でobjectsから消えても「そとへ でる」で入った場所へ戻る（CodeRabbitレビュー指摘）", () => {
    // 置いてある装飾の変化などで持ち場の割り当てが変わり、入った家がobjectsから
    // 消えることがある。buildingIdでの検索が失敗しても、入場時点の座標へ戻せることを確かめる。
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    placeFamilyHouse();
    const familyHouse = enterFamilyHouse();
    const expectedExit = getBuildingExitPoint(familyHouse);

    act(() => {
      useMapStore.getState().setFamily([], { familyPendingQuestCount: 0, members: {} });
    });

    emit({ event: "nearby", id: buildingWithRoute("exit").id });
    fireEvent.press(screen.getByRole("button", { name: "そとへ でる" }));

    expect(sentIntents("placePlayer")).toContainEqual({
      facingY: expectedExit.facingY,
      type: "placePlayer",
      x: expectedExit.x,
      z: expectedExit.z,
    });
  });

  test("自分の家に入ったときは、クローゼットがふだんどおり使える", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    placeFamilyHouse();
    enterOwnHouse();

    emit({ event: "nearby", id: buildingWithRoute("wardrobe").id });
    fireEvent.press(screen.getByRole("button", { name: "きがえる" }));

    expect(mockPush).toHaveBeenCalledWith("/wardrobe");
  });
});

describe("接近UI", () => {
  test("接近対象が無いときは「入る」ボタンを表示しない", () => {
    render(<RpgHubScreen />);

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("nearby イベントで「入る」ボタンが出入りする", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    const [firstBuilding] = sentIntents("setMap")[0].objects.filter(
      (object: any) => object.type === "building",
    );
    emit({ event: "nearby", id: firstBuilding.id });
    expect(screen.getByRole("button", { name: "入る" })).toBeTruthy();

    emit({ event: "nearby", id: null });
    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });
});

describe("NPCとの会話", () => {
  /** 送り込まれたマップから最初のNPCを取り出す。 */
  const firstNpc = () =>
    sentIntents("setMap")[0].objects.find((object: any) => object.type === "npc");

  test("NPCに接近すると「はなす」ボタンが出る", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    emit({ event: "nearby", id: firstNpc().id });

    expect(screen.getByRole("button", { name: /はなす/ })).toBeTruthy();
    // 建物用の「入る」は出さない
    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("「はなす」を押すと会話が出て、押すたびに進み、最後で閉じる", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();
    emit({ event: "nearby", id: npc.id });

    fireEvent.press(screen.getByRole("button", { name: /はなす/ }));

    // 名前と1行目が出る
    expect(screen.getByText(npc.name)).toBeTruthy();
    const nextButton = () => screen.queryByRole("button", { name: "次の話を見る" });
    expect(nextButton()).toBeTruthy();

    // 最後の行まで送ると「おわり」になり、押すと会話が閉じる
    let guard = 0;
    while (nextButton() && guard < 20) {
      fireEvent.press(nextButton()!);
      guard += 1;
    }
    fireEvent.press(screen.getByRole("button", { name: "会話を終わる" }));

    expect(screen.queryByText(npc.name)).toBeNull();
    // 会話が終われば、また話しかけられる
    expect(screen.getByRole("button", { name: /はなす/ })).toBeTruthy();
  });

  test("「とじる」で途中でも会話を閉じられる", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();
    emit({ event: "nearby", id: npc.id });
    fireEvent.press(screen.getByRole("button", { name: /はなす/ }));
    expect(screen.getByText(npc.name)).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "会話を閉じる" }));

    expect(screen.queryByText(npc.name)).toBeNull();
  });

  test("NPCのタップ（talkイベント）でも会話が開く", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();

    // 接近していなくても、タップで話しかけられる
    emit({ event: "talk", id: npc.id });

    expect(screen.getByText(npc.name)).toBeTruthy();
  });

  test("知らないidのtalkイベントでは何も起きない", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });

    emit({ event: "talk", id: "npc-does-not-exist" });

    expect(screen.queryByRole("button", { name: "会話を閉じる" })).toBeNull();
  });

  describe("家族のNPC（Issue #255）", () => {
    /** 家族を町に立たせる。取得（useFamilyTown）を通さず、ストアへ直接入れる。 */
    const placeFamily = () => {
      act(() => {
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

    afterEach(() => {
      act(() => {
        useMapStore.getState().setFamily([], { familyPendingQuestCount: 0, members: {} });
      });
    });

    test("家族が立つと、マップを送り直す", () => {
      render(<RpgHubScreen />);
      emit({ event: "ready" });
      mockSendIntent.mockClear();

      placeFamily();

      const npcs = sentIntents("setMap").at(-1).objects.filter((object: any) => object.type === "npc");
      expect(npcs.some((npc: any) => npc.familyMemberId === "kid-1")).toBe(true);
    });

    test("家族のNPCは、その人の状況と、話しかけた人のロールから会話を組み立てる", () => {
      loginAsParent();
      render(<RpgHubScreen />);
      emit({ event: "ready" });
      placeFamily();

      emit({ event: "talk", id: "npc-family-kid-1" });

      expect(screen.getByText("たろう")).toBeTruthy();
      let guard = 0;
      while (!screen.queryByText("たしかめて くれると うれしいな！") && guard < 5) {
        fireEvent.press(screen.getByRole("button", { name: "次の話を見る" }));
        guard += 1;
      }
      expect(screen.getByText("たしかめて くれると うれしいな！")).toBeTruthy();
    });

    test("状況だけが変わっても、マップは送り直さない", () => {
      render(<RpgHubScreen />);
      emit({ event: "ready" });
      placeFamily();
      mockSendIntent.mockClear();

      act(() => {
        const state = useMapStore.getState();
        state.setFamily(state.familyNpcs, { familyPendingQuestCount: 0, members: {} });
      });

      expect(sentIntents("setMap")).toHaveLength(0);
    });
  });

  test("会話中は移動の入力を止め、閉じたら戻す", () => {
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();
    mockSendIntent.mockClear();

    emit({ event: "talk", id: npc.id });
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });

    fireEvent.press(screen.getByRole("button", { name: "会話を閉じる" }));
    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: true,
      type: "setInputEnabled",
    });
  });

  test("会話中にWebViewが再ロードされても、移動の入力は止まったまま", () => {
    // 再生成されたシーンは入力受付が既定で有効。会話中なら送り直して止め直す
    render(<RpgHubScreen />);
    emit({ event: "ready" });
    emit({ event: "talk", id: firstNpc().id });
    mockSendIntent.mockClear();

    emit({ event: "ready" });

    expect(sentIntents("setInputEnabled").at(-1)).toEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });
});

describe("エラー表示", () => {
  test("シーンのエラーを画面に出し、再読み込みで消える", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    emit({ event: "error", message: "WebGL が初期化できません" });

    expect(screen.getByText("WebGL が初期化できません")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));

    expect(screen.queryByText("WebGL が初期化できません")).toBeNull();
    warnSpy.mockRestore();
  });

  test("WebView のロード失敗も画面に出る", () => {
    render(<RpgHubScreen />);

    act(() => {
      mockHandlers.onLoadError?.("net::ERR_FAILED");
    });

    expect(screen.getByText("net::ERR_FAILED")).toBeTruthy();
  });
});

describe("描画負荷の計測（Issue #200）", () => {
  // 計測の表示は読み上げの邪魔にならないよう隠してあるので、隠れた要素も含めて探す
  const HIDDEN = { includeHiddenElements: true };

  test("開発ビルドでは、シーンの準備ができたら計測を始め、届いた値と起動時間を隅に出す", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    // ready の前は計測を頼まず、何も出さない
    expect(sentIntents("setPerfStats")).toHaveLength(0);
    expect(screen.queryByTestId("hub-perf-overlay", HIDDEN)).toBeNull();
    emit({ event: "ready" });
    expect(sentIntents("setPerfStats")).toEqual([{ enabled: true, type: "setPerfStats" }]);
    expect(screen.getByTestId("hub-perf-overlay", HIDDEN)).toBeTruthy();
    expect(screen.getByText("計測中…", HIDDEN)).toBeTruthy();

    const rendersBeforeStats = mockHandlers.renders;
    emit({
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

  test("シーンを作り直したら、もう一度計測を頼む（起動時間は最初の1回のまま）", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    emit({ event: "ready" });
    emit({ event: "ready" });

    expect(sentIntents("setPerfStats")).toHaveLength(2);
    expect(logSpy.mock.calls.filter(([message]) => String(message).startsWith("[rpg-hub perf] 起動"))).toHaveLength(1);
    logSpy.mockRestore();
  });

  test("シーンがエラーになったら、計測の表示を消す", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    emit({ event: "ready" });
    expect(screen.getByTestId("hub-perf-overlay", HIDDEN)).toBeTruthy();
    emit({ event: "error", message: "壊れました" });

    expect(screen.queryByTestId("hub-perf-overlay", HIDDEN)).toBeNull();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
