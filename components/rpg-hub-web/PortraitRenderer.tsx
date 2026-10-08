import { File, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { readAssetText } from "./assetText";
import { buildPortraitHtml } from "./sceneHtml";
import {
  createRenderPortraitIntent,
  encodePortraitMessage,
  parsePortraitEvent,
  type PortraitLook,
} from "../../lib/rpg-hub/portraitBridge";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// どちらも postinstall で生成される（scripts/sync-babylon.mjs / scripts/build-rpg-scene.mjs）。
const babylonAsset = require("../../assets/babylon/babylon.txt");
const portraitAsset = require("../../assets/rpg-hub/portrait.txt");

type Props = {
  /** 描くキャラクターの見た目 */
  look: PortraitLook;
  /**
   * 描き終わったときに呼ぶ。
   * @param key - どの見た目の画像か（`getPortraitKey`）
   * @param dataUrl - 画像（PNG の data URL）
   */
  onRendered: (key: string, dataUrl: string) => void;
  /** 準備や描画に失敗したときに呼ぶ */
  onError?: (message: string) => void;
};

/**
 * 肖像を描く HTML をキャッシュへ書き出し、その URI を返す。
 * 8MB超の Babylon UMD を文字列 prop として渡さないため（RpgHubWebView と同じ）。
 * @returns 書き出した HTML の URI
 */
async function writePortraitHtml(): Promise<string> {
  const [babylonSource, portraitSource] = await Promise.all([
    readAssetText(babylonAsset, "babylon.txt"),
    readAssetText(portraitAsset, "portrait.txt"),
  ]);
  const htmlFile = new File(Paths.cache, "rpg-hub-portrait.html");
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(buildPortraitHtml(babylonSource, portraitSource));
  return htmlFile.uri;
}

/**
 * 書き出しは、アプリを開いている間に1回だけ行う。中身はアプリの版ごとに決まっていて、
 * 見た目が変わっても同じ HTML を使い回せるため。失敗したときは次の機会にやり直す。
 * 同時に複数の画面が求めても、同じファイルの削除・作成が競合しないよう1つに束ねる。
 */
let htmlPromise: Promise<string> | null = null;

/**
 * 肖像を描く HTML を用意する。
 * @returns HTML の URI
 */
function preparePortraitHtml(): Promise<string> {
  if (!htmlPromise) {
    htmlPromise = writePortraitHtml().catch((error: unknown) => {
      htmlPromise = null;
      throw error;
    });
  }
  return htmlPromise;
}

/**
 * キャラクターの肖像を見えないところで描き、画像を返す（Issue #306）。
 *
 * 画面には何も出さない。描いた画像を受け取った呼び出し側（`CharacterAvatar`）が
 * 覚えておき、このコンポーネントを外す。常に置いたままにしないのは、3Dを描く
 * WebView を動かし続けるとホーム画面が重くなるため。
 *
 * 描いている途中で見た目が変わったら、新しい見た目で描き直す。前の見た目の画像が
 * 遅れて届いても、`onRendered` にはキーが付いているので呼び出し側で見分けられる。
 */
export function PortraitRenderer({ look, onError, onRendered }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  // シーンの準備ができたか。WebView が作り直された（再読み込み）ときにも送り直せるよう、
  // ready のたびに増える世代にしてある（RpgHubScreen の sceneGeneration と同じ理由）
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    preparePortraitHtml()
      .then((preparedUri) => {
        if (!cancelled) setUri(preparedUri);
      })
      .catch((error: unknown) => {
        if (!cancelled) onErrorRef.current?.(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.postMessage(encodePortraitMessage(createRenderPortraitIntent(look)));
  }, [look, sceneGeneration]);

  if (!uri) return null;

  return (
    // 画面の外へは出さず、透明にして重ねておく。大きさを0にしないのは、
    // 端末によっては大きさの無い WebView が描画を止めてしまうことがあるため
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ height: 2, left: 0, opacity: 0, overflow: "hidden", position: "absolute", top: 0, width: 2 }}
      testID="portrait-renderer"
    >
      <WebView
        ref={webViewRef}
        source={{ uri }}
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        javaScriptEnabled
        // WebGL の描画が真っ黒になるのを防ぐ（RpgHubWebView と同じ）
        androidLayerType="hardware"
        onMessage={(event) => {
          const result = parsePortraitEvent(event.nativeEvent.data);
          if ("errors" in result) {
            console.warn("[portrait] 不正なイベント:", result.errors);
            return;
          }
          const portraitEvent = result.event;
          if (portraitEvent.event === "ready") setSceneGeneration((generation) => generation + 1);
          if (portraitEvent.event === "portrait") onRendered(portraitEvent.key, portraitEvent.dataUrl);
          if (portraitEvent.event === "error") onErrorRef.current?.(portraitEvent.message);
        }}
        onError={(event) => {
          onErrorRef.current?.(event.nativeEvent.description || "WebView の読み込みに失敗しました");
        }}
        style={{ backgroundColor: "transparent", height: 2, width: 2 }}
      />
    </View>
  );
}
