import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildRpgHubHtml } from "./sceneHtml";
import {
  encodeIntent,
  parseRpgHubEvent,
  type RpgHubEvent,
  type RpgHubIntent,
} from "../../lib/rpg-hub/bridge";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// どちらも postinstall で生成される（scripts/sync-babylon.mjs / scripts/build-rpg-scene.mjs）。
const babylonAsset = require("../../assets/babylon-spike/babylon.txt");
const sceneAsset = require("../../assets/rpg-hub/scene.txt");

export type RpgHubWebHandle = {
  /** RN → WebView へ意図を送る。 */
  sendIntent: (intent: RpgHubIntent) => void;
};

type Props = {
  /** WebView からイベントを受け取ったときのコールバック。 */
  onEvent: (event: RpgHubEvent) => void;
};

type LoadState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { status: "ready"; uri: string };

/**
 * アセット（txt）の中身を文字列として読み出す。
 * @param moduleRef - require したアセットモジュール
 * @param label - エラーメッセージ用のラベル
 * @returns アセットの中身
 */
async function readAssetText(moduleRef: number, label: string): Promise<string> {
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  const source = asset.localUri ?? asset.uri;
  if (!source) throw new Error(`${label} のローカルURIを解決できませんでした`);
  return new File(source).text();
}

/**
 * WebView に読み込ませる HTML をキャッシュへ書き出し、その URI を返す。
 * 8MB超の Babylon UMD を文字列 prop として渡さないための措置
 * （docs/RPG_HUB_ARCHITECTURE.md 8章）。
 * @returns 書き出した HTML の URI
 */
async function prepareSceneHtml(): Promise<string> {
  const [babylonSource, sceneSource] = await Promise.all([
    readAssetText(babylonAsset, "babylon.txt"),
    readAssetText(sceneAsset, "scene.txt"),
  ]);

  const html = buildRpgHubHtml(babylonSource, sceneSource);

  const htmlFile = new File(Paths.cache, "rpg-hub.html");
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(html);
  return htmlFile.uri;
}

export const RpgHubWebView = forwardRef<RpgHubWebHandle, Props>(function RpgHubWebView(
  { onEvent },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useImperativeHandle(ref, () => ({
    sendIntent: (intent) => {
      webViewRef.current?.postMessage(encodeIntent(intent));
    },
  }));

  useEffect(() => {
    let cancelled = false;
    prepareSceneHtml()
      .then((uri) => {
        if (!cancelled) setState({ status: "ready", uri });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            message: error instanceof Error ? error.message : String(error),
            status: "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900">
        <ActivityIndicator color="#fff" />
        <Text className="mt-3 text-white">マップを準備中…</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="text-center text-red-300">マップの準備に失敗しました</Text>
        <Text className="mt-2 text-center text-xs text-slate-400">{state.message}</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: state.uri }}
      originWhitelist={["*"]}
      allowFileAccess
      allowFileAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      // WebGL の描画が真っ黒になるのを防ぐ
      androidLayerType="hardware"
      onMessage={(event) => {
        const result = parseRpgHubEvent(event.nativeEvent.data);
        if ("errors" in result) {
          console.warn("[rpg-hub] 不正なイベント:", result.errors, event.nativeEvent.data);
          return;
        }
        onEvent(result.event);
      }}
      onError={(event) => {
        console.warn("[rpg-hub] WebView エラー:", event.nativeEvent);
      }}
      style={{ backgroundColor: "#dff4ff", flex: 1 }}
    />
  );
});
