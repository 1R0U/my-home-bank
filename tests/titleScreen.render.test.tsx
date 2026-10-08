import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();
/**
 * 画面のフォーカスを、テストから切り替えられるようにする。
 * `focus()` でフォーカスを得たことにし、戻り値を呼ぶとフォーカスが外れたことになる。
 */
const mockFocus: { effect?: () => void | (() => void) } = {};
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus.effect = effect;
  },
}));

function focus(): () => void {
  let cleanup: (() => void) | undefined;
  act(() => {
    cleanup = mockFocus.effect?.() || undefined;
  });
  return () => act(() => cleanup?.());
}

const mockSendIntent = jest.fn();
/** 背景の WebView に渡されたコールバックを、テストから発火させるために保持する。 */
const mockWebView: { onEvent?: (event: unknown) => void; props?: Record<string, unknown> } = {};
jest.mock("../components/rpg-hub-web/RpgHubWebView", () => {
  const { forwardRef, useImperativeHandle } = require("react");
  return {
    RpgHubWebView: forwardRef((props: any, ref: any) => {
      mockWebView.onEvent = props.onEvent;
      mockWebView.props = props;
      useImperativeHandle(ref, () => ({ sendIntent: mockSendIntent }));
      return null;
    }),
  };
});

import TitleScreen from "../app/title";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.effect = undefined;
  mockWebView.onEvent = undefined;
  mockWebView.props = undefined;
});

test("タイトルと「TAP TO START」を表示する", () => {
  render(<TitleScreen />);
  expect(screen.getByText("おうちギルド")).toBeTruthy();
  expect(screen.getByText("TAP TO START")).toBeTruthy();
});

test("「ぼうけんをはじめる」「ギルドにとうろくする」のボタンは置かない", () => {
  render(<TitleScreen />);
  expect(screen.queryByText("ぼうけんをはじめる")).toBeNull();
  expect(screen.queryByText("ギルドにとうろくする")).toBeNull();
});

test("看板の文字は背景のボタンにまとめず、個別に読み上げられる", () => {
  render(<TitleScreen />);
  expect(screen.getByRole("header", { name: "おうちギルド" })).toBeTruthy();
  expect(screen.getByTestId("title-stage").props.accessible).toBe(false);
});

test("スクリーンリーダーでは「TAP TO START」をボタンとして操作でき、ログイン画面へ進む", () => {
  render(<TitleScreen />);
  fireEvent.press(screen.getByRole("button", { name: "タップしてはじめる" }));
  expect(mockPush).toHaveBeenCalledWith("/login");
});

test("背景をタップしてもログイン画面へ進む", () => {
  render(<TitleScreen />);
  fireEvent.press(screen.getByTestId("title-stage"));
  expect(mockPush).toHaveBeenCalledWith("/login");
});

test("背景には我が家タウンの3Dシーンを、タイトル用のモードで映す", () => {
  render(<TitleScreen />);
  focus();
  // 背景は読み上げの対象から外している（町の中身を読み上げても意味がないため）
  expect(screen.queryByTestId("title-town-backdrop")).toBeNull();
  expect(screen.getByTestId("title-town-backdrop", { includeHiddenElements: true })).toBeTruthy();
  expect(mockWebView.props?.mode).toBe("title");
});

test("背景の準備ができたら、町の固定物だけを送る（置いた装飾は映さない）", () => {
  render(<TitleScreen />);
  focus();
  act(() => mockWebView.onEvent?.({ event: "ready" }));
  expect(mockSendIntent).toHaveBeenCalledTimes(1);
  const intent = mockSendIntent.mock.calls[0][0] as { objects: unknown; type: string };
  expect(intent.type).toBe("setMap");
  expect(intent.objects).toBe(INITIAL_MAP_OBJECTS);
});

test("WebViewが読み込み直して ready がもう一度来たら、町を送り直す", () => {
  render(<TitleScreen />);
  focus();
  act(() => mockWebView.onEvent?.({ event: "ready" }));
  act(() => mockWebView.onEvent?.({ event: "ready" }));
  expect(mockSendIntent).toHaveBeenCalledTimes(2);
});

test("フォーカスが外れたら背景の3Dを外し、戻ってきたら置き直す（見えない間に描き続けない）", () => {
  render(<TitleScreen />);
  // フォーカスを得るまでは置かない
  expect(screen.queryByTestId("title-town-backdrop", { includeHiddenElements: true })).toBeNull();

  const blur = focus();
  expect(screen.getByTestId("title-town-backdrop", { includeHiddenElements: true })).toBeTruthy();

  // ログイン画面へ進んでフォーカスが外れた
  blur();
  expect(screen.queryByTestId("title-town-backdrop", { includeHiddenElements: true })).toBeNull();

  // 戻ってきた
  focus();
  expect(screen.getByTestId("title-town-backdrop", { includeHiddenElements: true })).toBeTruthy();
});
