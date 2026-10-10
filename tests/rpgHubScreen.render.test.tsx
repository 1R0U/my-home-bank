import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();
const mockStackScreen = jest.fn<(props: { options?: Record<string, unknown> }) => null>(() => null);
const mockSendIntent = jest.fn();
const mockUseFocusEffect = jest.fn<(effect: () => void | (() => void)) => void>();
const mockStartBgm = jest.fn<() => Promise<void>>(() => Promise.resolve());
const mockStopBgm = jest.fn();
/** WebView ラッパに渡されたコールバックを、テストから発火させるために保持する。 */
const mockHandlers: {
  onEvent?: (event: unknown) => void;
  onLoadError?: (message: string) => void;
} = {};

jest.mock("expo-router", () => ({
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  useFocusEffect: (effect: () => void | (() => void)) => mockUseFocusEffect(effect),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../lib/audio", () => ({
  AUDIO_SOURCES: { rpgHubBgm: 2 },
  useLoopingAudio: () => ({ start: mockStartBgm, stop: mockStopBgm }),
}));

jest.mock("../components/rpg-hub-web/RpgHubWebView", () => {
  const { forwardRef, useImperativeHandle } = require("react");
  return {
    RpgHubWebView: forwardRef((props: any, ref: any) => {
      mockHandlers.onEvent = props.onEvent;
      mockHandlers.onLoadError = props.onLoadError;
      useImperativeHandle(ref, () => ({ sendIntent: mockSendIntent }));
      return null;
    }),
  };
});

// 連続記録のお祝い（Issue #372）は tests/questStreakCelebration.render.test.tsx で確かめる
jest.mock("../components/QuestStreakCelebration", () => () => null);

jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  WebVirtualPad: ({ children }: { children: React.ReactNode }) => children,
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

import RpgHubScreen from "../components/RpgHubScreen";
import { resolveMapRoute } from "../lib/rpg-hub/routes";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";

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

/** 送信された意図のうち、指定した type のものを集める。 */
const sentIntents = (type: string) =>
  mockSendIntent.mock.calls.map(([intent]) => intent as any).filter((intent) => intent?.type === type);

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
  useAppearanceStore.setState({
    characterType: "frog",
    characterTypeLoadedFor: null,
    palette: {},
    paletteLoadedFor: null,
    paletteLoadedCharacterType: "frog",
  });
  mockPush.mockImplementation(() => undefined);
  mockFetchCharacterType.mockResolvedValue("frog");
  mockFetchCharacterPalette.mockResolvedValue({});
  delete mockHandlers.onEvent;
  delete mockHandlers.onLoadError;
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

  test("設定ボタンからの遷移でも WebView の入力を止める", () => {
    render(<RpgHubScreen />);

    fireEvent.press(screen.getByRole("button", { name: "設定を開く" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });

  test("設定ボタンを連打しても1回しか遷移しない", () => {
    render(<RpgHubScreen />);

    const settingsButton = screen.getByRole("button", { name: "設定を開く" });
    fireEvent.press(settingsButton);
    fireEvent.press(settingsButton);

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("遷移に失敗したら入力を戻して再操作できる", () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<RpgHubScreen />);

    const settingsButton = screen.getByRole("button", { name: "設定を開く" });
    fireEvent.press(settingsButton);

    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: true,
      type: "setInputEnabled",
    });

    fireEvent.press(settingsButton);
    expect(mockPush).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  test("navigate イベントを受け取ると対応する画面へ遷移する", () => {
    render(<RpgHubScreen />);

    emit({ event: "navigate", route: "bank" });

    expect(mockPush).toHaveBeenCalledWith("/bank");
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
    // 大人がそのまま入ると意味がねじれる。銀行は共通画面なので変わらない
    loginAsParent();
    render(<RpgHubScreen />);

    emit({ event: "navigate", route: "tasks" });

    expect(mockPush).toHaveBeenCalledWith("/tasks-adult");
  });

  test("navigate イベントが commit を挟まず連続で届いても1回しか遷移しない", () => {
    // 遷移ロックを state で判定していると、同じ描画のクロージャが 2 回とも
    // ロック解除前の値を読んで多重に router.push してしまう。
    render(<RpgHubScreen />);

    act(() => {
      mockHandlers.onEvent?.({ event: "navigate", route: "bank" });
      mockHandlers.onEvent?.({ event: "navigate", route: "store" });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/bank");
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
