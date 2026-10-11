// react-native-webview はネイティブモジュールが無いと読み込めないため、jest では
// 何も描かない部品に差し替える（Issue #306）。
// 肖像を描く PortraitRenderer がホーム画面・設定画面から読み込まれるようになり、
// これらの画面の描画テストでも読み込まれるようになった。
// WebView の中身（肖像の描き方）は tests/portraitBridge.test.mjs などで確かめる。
const { forwardRef } = require("react");
const { View } = require("react-native");

const WebView = forwardRef(function WebView(props, _ref) {
  // スクリーンリーダーから隠す指定だけは、描画テストで確かめられるように引き継ぐ。
  return require("react").createElement(View, {
    accessibilityElementsHidden: props.accessibilityElementsHidden,
    importantForAccessibility: props.importantForAccessibility,
    testID: "mock-webview",
  });
});

module.exports = { WebView, default: WebView };
