import { render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

/**
 * RPGハブの移動スティックが、実機のスクリーンリーダーから見つけられることの確認（Issue #239）。
 * PR #340 の実機確認で、スティックの要素に pointerEvents="none" を付けていたため
 * VoiceOver で「移動スティック」が読まれなかった。同じ書き方に戻さないためのテスト。
 */

jest.mock("../components/rpg-hub-web/assetText", () => ({
  readAssetText: () => Promise.resolve(""),
}));

jest.mock("expo-file-system", () => ({
  File: class {
    exists = false;
    uri = "file:///cache/rpg-hub.html";
    create() {}
    delete() {}
    write() {}
  },
  Paths: { cache: "file:///cache" },
}));

import { RpgHubWebView } from "../components/rpg-hub-web/RpgHubWebView";
import { WebVirtualPad } from "../components/rpg-hub-web/WebVirtualPad";

describe("移動スティックの読み上げ（Issue #239）", () => {
  test("スティックは1要素として読まれ、タッチを受けない指定で VoiceOver から外れていない", () => {
    render(
      <WebVirtualPad onInputChange={() => {}}>
        <Text>ハブ</Text>
      </WebVirtualPad>,
    );

    const stick = screen.getByTestId("virtual-pad-accessibility");
    expect(stick.props.accessible).toBe(true);
    expect(stick.props.accessibilityLabel).toBe("移動スティック");
    expect(stick.props.accessibilityHint).toBe("動かしたい方向へドラッグしてください");
    // pointerEvents="none" だと iOS の VoiceOver がこの要素を見つけられない
    expect(stick.props.pointerEvents).toBeUndefined();
    // children（ボタン類）はまとめられず、個別に読める
    expect(screen.getByText("ハブ")).toBeTruthy();
  });

  test("3D表示の WebView はスクリーンリーダーから隠し、下のスティックに届くようにする", async () => {
    render(<RpgHubWebView characterType="frog" onEvent={() => {}} />);

    const webView = await waitFor(() => screen.getByTestId("mock-webview", { includeHiddenElements: true }));
    expect(webView.props.accessibilityElementsHidden).toBe(true);
    expect(webView.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
