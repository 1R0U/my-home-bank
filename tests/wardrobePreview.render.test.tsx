import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

/**
 * 更衣室のプレビュー（Issue #344）の、WebView との受け渡し。
 * WebView の中身（描き方）は tests/wardrobePreviewBridge.test.mjs で確かめる。
 */

// 渡された props（onLoadStart / onMessage）を取り出せる WebView に差し替える
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
    uri = "file:///cache/rpg-hub-wardrobe-preview.html";
    create() {}
    delete() {}
    write() {}
  },
  Paths: { cache: "file:///cache" },
}));
jest.mock("../components/rpg-hub-web/assetText", () => ({
  readAssetText: () => Promise.resolve(""),
}));

import { WardrobePreview } from "../components/rpg-hub-web/WardrobePreview";

const look = { characterType: "frog" as const, equipment: {}, palette: {}, season: "autumn" as const };

/** WebView からイベントを送る */
const send = (event: object) =>
  act(() => mockWebViewProps.onMessage?.({ nativeEvent: { data: JSON.stringify(event) } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockWebViewProps = {};
});

/** HTML の用意を待って描く */
const renderPreview = async () => {
  render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
};

test("準備ができたら見た目を送る", async () => {
  await renderPreview();
  expect(mockPostMessage).not.toHaveBeenCalled();

  send({ event: "ready" });

  expect(mockPostMessage).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockPostMessage.mock.calls[0][0] as string)).toEqual({ look, type: "setLook" });
});

test("準備前の失敗は、映らない旨の表示に切り替える", async () => {
  await renderPreview();

  send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(screen.getByText(/プレビューを表示できませんでした/)).toBeTruthy();
});

test("準備後の失敗では、映している姿を残したまま、映せなかったことを知らせる（PR #346 レビュー対応）", async () => {
  await renderPreview();
  send({ event: "ready" });

  send({ event: "error", message: "lookが不正です" });

  expect(screen.queryByText(/プレビューを表示できませんでした/)).toBeNull();
  expect(screen.getByText(/えらんだものを うつせませんでした/)).toBeTruthy();
});

test("次の見た目を送るときに、映せなかった知らせを消す", async () => {
  const { rerender } = render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
  send({ event: "ready" });
  send({ event: "error", message: "lookが不正です" });

  rerender(<WardrobePreview height={300} look={{ ...look, characterType: "cat" }} />);

  expect(screen.queryByText(/えらんだものを うつせませんでした/)).toBeNull();
  expect(mockPostMessage).toHaveBeenCalledTimes(2);
});

test("再読み込みが始まったら準備前に戻し、その間の失敗を表示する（PR #346 レビュー対応）", async () => {
  await renderPreview();
  send({ event: "ready" });

  act(() => mockWebViewProps.onLoadStart?.());
  send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(screen.getByText(/プレビューを表示できませんでした/)).toBeTruthy();
});

test("再読み込みのあと準備ができたら、見た目を送り直す", async () => {
  await renderPreview();
  send({ event: "ready" });
  act(() => mockWebViewProps.onLoadStart?.());

  send({ event: "ready" });

  expect(mockPostMessage).toHaveBeenCalledTimes(2);
});

// 外側の View は accessible なので中の Text は個別に読まれない。知らせはラベルに含めて伝える（Issue #392）
const previewLabel = () => screen.getByTestId("wardrobe-preview").props.accessibilityLabel as string;

test("知らせがないときは、プレビューの名前だけを読ませる", async () => {
  await renderPreview();
  send({ event: "ready" });

  expect(screen.getByTestId("wardrobe-preview").props.accessible).toBe(true);
  expect(previewLabel()).toBe("きがえのプレビュー");
});

test("準備前の失敗は、表示できなかったことをラベルでも伝える", async () => {
  await renderPreview();

  send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(previewLabel()).toMatch(/^きがえのプレビュー。プレビューを表示できませんでした/);
});

test("準備後の失敗は、映せなかったことをラベルでも伝え、次の見た目を送ると戻す", async () => {
  const { rerender } = render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
  send({ event: "ready" });

  send({ event: "error", message: "lookが不正です" });
  expect(previewLabel()).toMatch(/^きがえのプレビュー。えらんだものを うつせませんでした/);

  rerender(<WardrobePreview height={300} look={{ ...look, characterType: "cat" }} />);
  expect(previewLabel()).toBe("きがえのプレビュー");
});
