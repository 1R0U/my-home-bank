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

import RpgHubWebScreen from "../components/rpg-hub-web/RpgHubWebScreen";

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
    render(<RpgHubWebScreen />);
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
    render(<RpgHubWebScreen />);

    emit({ event: "ready" });
    emit({ event: "ready" });

    expect(sentIntents("setMap")).toHaveLength(2);
  });
});

describe("画面遷移", () => {
  test("設定ボタンからの遷移でも WebView の入力を止める", () => {
    render(<RpgHubWebScreen />);

    fireEvent.press(screen.getByRole("button", { name: "設定を開く" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
    expect(sentIntents("setInputEnabled")).toContainEqual({
      enabled: false,
      type: "setInputEnabled",
    });
  });

  test("設定ボタンを連打しても1回しか遷移しない", () => {
    render(<RpgHubWebScreen />);

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
    render(<RpgHubWebScreen />);

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
    render(<RpgHubWebScreen />);

    emit({ event: "navigate", route: "bank" });

    expect(mockPush).toHaveBeenCalledWith("/bank");
  });
});

describe("接近UI", () => {
  test("接近対象が無いときは「入る」ボタンを表示しない", () => {
    render(<RpgHubWebScreen />);

    expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
  });

  test("nearby イベントで「入る」ボタンが出入りする", () => {
    render(<RpgHubWebScreen />);
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

describe("エラー表示", () => {
  test("シーンのエラーを画面に出し、再読み込みで消える", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<RpgHubWebScreen />);

    emit({ event: "error", message: "WebGL が初期化できません" });

    expect(screen.getByText("WebGL が初期化できません")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "マップを再読み込みする" }));

    expect(screen.queryByText("WebGL が初期化できません")).toBeNull();
    warnSpy.mockRestore();
  });

  test("WebView のロード失敗も画面に出る", () => {
    render(<RpgHubWebScreen />);

    act(() => {
      mockHandlers.onLoadError?.("net::ERR_FAILED");
    });

    expect(screen.getByText("net::ERR_FAILED")).toBeTruthy();
  });
});
