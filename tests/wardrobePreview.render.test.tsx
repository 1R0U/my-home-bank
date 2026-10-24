import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { getPortraitKey } from "../lib/rpg-hub/portraitBridge";
import { getByFuriganaText, queryByFuriganaText } from "./furiganaQueries";

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
const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** WebView からイベントを送る */
const send = async (event: object) =>
  act(() => mockWebViewProps.onMessage?.({ nativeEvent: { data: JSON.stringify(event) } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockWebViewProps = {};
});

/** HTML の用意を待って描く */
const renderPreview = async () => {
  await render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
};

test("準備ができたら見た目を送る", async () => {
  await renderPreview();
  expect(mockPostMessage).not.toHaveBeenCalled();

  await send({ event: "ready" });

  expect(mockPostMessage).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockPostMessage.mock.calls[0][0] as string)).toEqual({ look, type: "setLook" });
});

test("肖像を受け取る指定があるときだけ画像を依頼し、現在の見た目の画像を返す", async () => {
  const onPortraitRendered = jest.fn();
  await render(<WardrobePreview height={300} look={look} onPortraitRendered={onPortraitRendered} />);
  await act(async () => undefined);
  await send({ event: "ready" });

  expect(JSON.parse(mockPostMessage.mock.calls[0][0] as string)).toEqual({
    look,
    renderPortrait: true,
    type: "setLook",
  });
  await send({ dataUrl: PNG, event: "portrait", key: getPortraitKey(look) });
  expect(onPortraitRendered).toHaveBeenCalledWith(getPortraitKey(look), PNG);
});

test("見た目を選び直したあとに届いた前の肖像は使わず、新しい見た目の肖像だけ返す", async () => {
  const onPortraitRendered = jest.fn();
  const { rerender } = await render(
    <WardrobePreview height={300} look={look} onPortraitRendered={onPortraitRendered} />,
  );
  await act(async () => undefined);
  await send({ event: "ready" });
  const nextLook = { ...look, characterType: "cat" as const, palette: { accent: "#4a90e2" } };

  await rerender(<WardrobePreview height={300} look={nextLook} onPortraitRendered={onPortraitRendered} />);
  await send({ dataUrl: PNG, event: "portrait", key: getPortraitKey(look) });
  expect(onPortraitRendered).not.toHaveBeenCalled();

  await send({ dataUrl: PNG, event: "portrait", key: getPortraitKey(nextLook) });
  expect(onPortraitRendered).toHaveBeenCalledTimes(1);
  expect(onPortraitRendered).toHaveBeenCalledWith(getPortraitKey(nextLook), PNG);
});

test("現在の見た目のキーでも、不正な肖像は返さない", async () => {
  const onPortraitRendered = jest.fn();
  await render(<WardrobePreview height={300} look={look} onPortraitRendered={onPortraitRendered} />);
  await act(async () => undefined);
  await send({ event: "ready" });

  await send({ dataUrl: "https://example.com/portrait.png", event: "portrait", key: getPortraitKey(look) });

  expect(onPortraitRendered).not.toHaveBeenCalled();
});

test("準備前の失敗は、映らない旨の表示に切り替える", async () => {
  await renderPreview();

  await send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(getByFuriganaText(/プレビューを表示できませんでした/)).toBeTruthy();
});

test("準備後の失敗では、映している姿を残したまま、映せなかったことを知らせる（PR #346 レビュー対応）", async () => {
  await renderPreview();
  await send({ event: "ready" });

  await send({ event: "error", message: "lookが不正です" });

  expect(queryByFuriganaText(/プレビューを表示できませんでした/)).toBeNull();
  expect(screen.getByText(/えらんだものを うつせませんでした/)).toBeTruthy();
});

test("次の見た目を送るときに、映せなかった知らせを消す", async () => {
  const { rerender } = await render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
  await send({ event: "ready" });
  await send({ event: "error", message: "lookが不正です" });

  await rerender(<WardrobePreview height={300} look={{ ...look, characterType: "cat" }} />);

  expect(screen.queryByText(/えらんだものを うつせませんでした/)).toBeNull();
  expect(mockPostMessage).toHaveBeenCalledTimes(2);
});

test("再読み込みが始まったら準備前に戻し、その間の失敗を表示する（PR #346 レビュー対応）", async () => {
  await renderPreview();
  await send({ event: "ready" });

  await act(() => mockWebViewProps.onLoadStart?.());
  await send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(getByFuriganaText(/プレビューを表示できませんでした/)).toBeTruthy();
});

test("再読み込みのあと準備ができたら、見た目を送り直す", async () => {
  await renderPreview();
  await send({ event: "ready" });
  await act(() => mockWebViewProps.onLoadStart?.());

  await send({ event: "ready" });

  expect(mockPostMessage).toHaveBeenCalledTimes(2);
});

// 外側の View は accessible なので中の Text は個別に読まれない。知らせはラベルに含めて伝える（Issue #392）
const previewLabel = () => screen.getByTestId("wardrobe-preview").props.accessibilityLabel as string;

test("知らせがないときは、プレビューの名前だけを読ませる", async () => {
  await renderPreview();
  await send({ event: "ready" });

  expect(screen.getByTestId("wardrobe-preview").props.accessible).toBe(true);
  expect(previewLabel()).toBe("きがえのプレビュー");
});

test("準備前の失敗は、表示できなかったことをラベルでも伝える", async () => {
  await renderPreview();

  await send({ event: "error", message: "BABYLON グローバルが読み込まれていません" });

  expect(previewLabel()).toMatch(/^きがえのプレビュー。プレビューを表示できませんでした/);
});

test("準備後の失敗は、映せなかったことをラベルでも伝え、次の見た目を送ると戻す", async () => {
  const { rerender } = await render(<WardrobePreview height={300} look={look} />);
  await act(async () => undefined);
  await send({ event: "ready" });

  await send({ event: "error", message: "lookが不正です" });
  expect(previewLabel()).toMatch(/^きがえのプレビュー。えらんだものを うつせませんでした/);

  await rerender(<WardrobePreview height={300} look={{ ...look, characterType: "cat" }} />);
  expect(previewLabel()).toBe("きがえのプレビュー");
});
