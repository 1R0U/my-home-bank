import { File, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { readAssetText } from "./assetText";
import { WARDROBE_PREVIEW_BACKGROUND, buildWardrobePreviewHtml } from "./sceneHtml";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";
import {
  createSetPreviewLookIntent,
  encodeWardrobePreviewMessage,
  parseWardrobePreviewEvent,
} from "../../lib/rpg-hub/wardrobePreviewBridge";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// どちらも postinstall で生成される（scripts/sync-babylon.mjs / scripts/build-rpg-scene.mjs）。
const babylonAsset = require("../../assets/babylon/babylon.txt");
const previewAsset = require("../../assets/rpg-hub/wardrobePreview.txt");

type Props = {
  /** 映すキャラクターの見た目。保存前の、更衣室で選んでいる着せ替え品を含む */
  look: PortraitLook;
  /** プレビューの高さ（React Native の長さの単位） */
  height: number;
};

/**
 * プレビューを描く HTML をキャッシュへ書き出し、その URI を返す。
 * 8MB超の Babylon UMD を文字列 prop として渡さないため（RpgHubWebView と同じ）。
 * @returns 書き出した HTML の URI
 */
async function writePreviewHtml(): Promise<string> {
  const [babylonSource, previewSource] = await Promise.all([
    readAssetText(babylonAsset, "babylon.txt"),
    readAssetText(previewAsset, "wardrobePreview.txt"),
  ]);
  const htmlFile = new File(Paths.cache, "rpg-hub-wardrobe-preview.html");
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(buildWardrobePreviewHtml(babylonSource, previewSource));
  return htmlFile.uri;
}

/**
 * 書き出しは、アプリを開いている間に1回だけ行う（PortraitRenderer と同じ考え方）。
 * 失敗したときは次の機会にやり直す。
 */
let htmlPromise: Promise<string> | null = null;

/**
 * プレビューを描く HTML を用意する。
 * @returns HTML の URI
 */
function preparePreviewHtml(): Promise<string> {
  if (!htmlPromise) {
    htmlPromise = writePreviewHtml().catch((error: unknown) => {
      htmlPromise = null;
      throw error;
    });
  }
  return htmlPromise;
}

/**
 * 更衣室で、選んでいる着せ替え品をキャラクターに着せて見せる（Issue #344）。
 *
 * 指で横になぞると、キャラクターの周りをぐるっと回って背中側まで見られる。
 * 縦になぞると、上から見下ろしたり真横から見たりできる。
 * ピンチで寄ったり引いたりもできる（描く側は webview/rpg-hub/wardrobePreview.ts）。
 *
 * **保存はしない。** 見た目を映すだけで、確定は更衣室の画面が受け持つ。
 */
export function WardrobePreview({ height, look }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  // シーンの準備ができたか。WebView が作り直された（再読み込み）ときにも送り直せるよう、
  // ready のたびに増える世代にしてある（PortraitRenderer と同じ理由）
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    preparePreviewHtml()
      .then((preparedUri) => {
        if (!cancelled) setUri(preparedUri);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.postMessage(encodeWardrobePreviewMessage(createSetPreviewLookIntent(look)));
  }, [look, sceneGeneration]);

  const isLoading = error === null && sceneGeneration === 0;

  return (
    <View
      accessibilityHint="なぞると回り、2本の指で広げると大きく見えます"
      accessibilityLabel="きがえのプレビュー"
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: WARDROBE_PREVIEW_BACKGROUND, height }}
      testID="wardrobe-preview"
    >
      {uri && error === null ? (
        <WebView
          ref={webViewRef}
          source={{ uri }}
          originWhitelist={["*"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          javaScriptEnabled
          // WebGL の描画が真っ黒になるのを防ぐ（RpgHubWebView と同じ）
          androidLayerType="hardware"
          // 指でなぞる操作はキャラクターの回転に使う。WebView 自体はスクロールさせない
          scrollEnabled={false}
          bounces={false}
          onMessage={(event) => {
            const result = parseWardrobePreviewEvent(event.nativeEvent.data);
            if ("errors" in result) {
              console.warn("[wardrobe-preview] 不正なイベント:", result.errors);
              return;
            }
            if (result.event.event === "ready") setSceneGeneration((generation) => generation + 1);
            if (result.event.event === "error") {
              console.warn("[wardrobe-preview] WebView 側のエラー:", result.event.message);
              // 準備ができる前の失敗は、待っていても映らないので表示を切り替える。
              // 準備ができたあとの失敗（1回分の見た目が不正など）は、前の姿を映したままにする
              if (sceneGeneration === 0) setError(result.event.message);
            }
          }}
          onError={(event) => {
            setError(event.nativeEvent.description || "WebView の読み込みに失敗しました");
          }}
          style={{ backgroundColor: "transparent", flex: 1 }}
        />
      ) : null}
      {isLoading ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator />
        </View>
      ) : null}
      {error !== null ? (
        <View className="absolute inset-0 items-center justify-center px-6">
          <Text className="text-center text-sm text-slate-600">
            プレビューを表示できませんでした。えらんだものは、このまま「けってい」できます。
          </Text>
        </View>
      ) : null}
    </View>
  );
}
