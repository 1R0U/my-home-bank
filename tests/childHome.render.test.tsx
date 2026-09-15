import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();
const mockSendIntent = jest.fn();
/** WebView ラッパに渡されたコールバックを、テストから発火させるために保持する。 */
const mockHandlers: {
  onEvent?: (event: unknown) => void;
  onLoadError?: (message: string) => void;
} = {};

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
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

jest.mock("../components/rpg-hub-web/WebVirtualPad", () => ({
  WebVirtualPad: ({ children }: { children: React.ReactNode }) => children,
}));

import ChildHomeScreen from "../components/ChildHomeScreen";
import { MAP_ROUTES } from "../types/map";

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
  mockPush.mockImplementation(() => undefined);
  delete mockHandlers.onEvent;
  delete mockHandlers.onLoadError;
});

describe("マップの送り込み", () => {
  test("ready を受け取るとマップと季節を送る", () => {
    render(<ChildHomeScreen />);
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
    render(<ChildHomeScreen />);

    emit({ event: "ready" });
    emit({ event: "ready" });

    expect(sentIntents("setMap")).toHaveLength(2);
  });
});

describe("画面遷移", () => {
  test("設定ボタンからの遷移でも WebView の入力を止める", () => {
    render(<ChildHomeScreen />);

    fireEvent.press(screen.getByRole("button", { name: "設定を開く" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });

  test("設定ボタンを連打しても1回しか遷移しない", () => {
    render(<ChildHomeScreen />);

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
    render(<ChildHomeScreen />);

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
    render(<ChildHomeScreen />);

    emit({ event: "navigate", route: "bank" });

    expect(mockPush).toHaveBeenCalledWith("/bank");
  });

  test("接近中に「入る」を押すと対象の建物の画面へ遷移する", () => {
    render(<ChildHomeScreen />);
    emit({ event: "ready" });

    const [building] = sentIntents("setMap")[0].objects.filter(
      (object: any) => object.type === "building",
    );
    emit({ event: "nearby", id: building.id });

    fireEvent.press(screen.getByRole("button", { name: "入る" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(MAP_ROUTES[building.route]);
  });

  test("navigate イベントが commit を挟まず連続で届いても1回しか遷移しない", () => {
    // 遷移ロックを state で判定していると、同じ描画のクロージャが 2 回とも
    // ロック解除前の値を読んで多重に router.push してしまう。
    render(<ChildHomeScreen />);

    act(() => {
      mockHandlers.onEvent?.({ event: "navigate", route: "bank" });
      mockHandlers.onEvent?.({ event: "navigate", route: "store" });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/bank");
  });
});

describe("接近UI", () => {
  test("接近対象が無いときは「入る」ボタンを表示しない", () => {
    render(<ChildHomeScreen />);

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("nearby イベントで「入る」ボタンが出入りする", () => {
    render(<ChildHomeScreen />);
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
    render(<ChildHomeScreen />);
    emit({ event: "ready" });

    emit({ event: "nearby", id: firstNpc().id });

    expect(screen.getByRole("button", { name: /はなす/ })).toBeTruthy();
    // 建物用の「入る」は出さない
    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("「はなす」を押すと会話が出て、押すたびに進み、最後で閉じる", () => {
    render(<ChildHomeScreen />);
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
    render(<ChildHomeScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();
    emit({ event: "nearby", id: npc.id });
    fireEvent.press(screen.getByRole("button", { name: /はなす/ }));
    expect(screen.getByText(npc.name)).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "会話を閉じる" }));

    expect(screen.queryByText(npc.name)).toBeNull();
  });

  test("NPCのタップ（talkイベント）でも会話が開く", () => {
    render(<ChildHomeScreen />);
    emit({ event: "ready" });
    const npc = firstNpc();

    // 接近していなくても、タップで話しかけられる
    emit({ event: "talk", id: npc.id });

    expect(screen.getByText(npc.name)).toBeTruthy();
  });

  test("知らないidのtalkイベントでは何も起きない", () => {
    render(<ChildHomeScreen />);
    emit({ event: "ready" });

    emit({ event: "talk", id: "npc-does-not-exist" });

    expect(screen.queryByRole("button", { name: "会話を閉じる" })).toBeNull();
  });

  test("会話中は移動の入力を止め、閉じたら戻す", () => {
    render(<ChildHomeScreen />);
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
});

describe("エラー表示", () => {
  test("シーンのエラーを画面に出し、再読み込みで消える", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<ChildHomeScreen />);

    emit({ event: "error", message: "WebGL が初期化できません" });

    expect(screen.getByText("WebGL が初期化できません")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));

    expect(screen.queryByText("WebGL が初期化できません")).toBeNull();
    warnSpy.mockRestore();
  });

  test("WebView のロード失敗も画面に出る", () => {
    render(<ChildHomeScreen />);

    act(() => {
      mockHandlers.onLoadError?.("net::ERR_FAILED");
    });

    expect(screen.getByText("net::ERR_FAILED")).toBeTruthy();
  });
});
