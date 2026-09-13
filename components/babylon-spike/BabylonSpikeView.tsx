import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildSceneHtml } from "./sceneHtml";
import {
  type BabylonEvent,
  type BabylonIntent,
  encodeIntent,
  parseBabylonEvent,
} from "../../lib/babylon-spike/bridge.ts";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// このファイルは postinstall（scripts/sync-babylon.mjs）で node_modules から生成される。
const babylonAsset = require("../../assets/babylon-spike/babylon.txt");

export type BabylonSpikeHandle = {
  /** RN → WebView へ意図を送る */
  sendIntent: (intent: BabylonIntent) => void;
};

type Props = {
  /** WebView からイベントを受け取ったときのコールバック（省略時は console.log のみ） */
  onEvent?: (event: BabylonEvent) => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; uri: string };

async function prepareSceneHtml(): Promise<string> {
  const asset = Asset.fromModule(babylonAsset);
  await asset.downloadAsync();
  const source = asset.localUri ?? asset.uri;
  if (!source) throw new Error("babylon.txt のローカルURIを解決できませんでした");

  const babylonSource = await new File(source).text();
  const html = buildSceneHtml(babylonSource);

  const htmlFile = new File(Paths.cache, "babylon-spike.html");
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(html);
  return htmlFile.uri;
}

export const BabylonSpikeView = forwardRef<BabylonSpikeHandle, Props>(function BabylonSpikeView(
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
        <Text className="mt-3 text-white">Babylon シーンを準備中…</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="text-center text-red-300">シーンの準備に失敗しました</Text>
        <Text className="mt-2 text-center text-xs text-slate-400">{state.message}</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      // 自己完結HTML（外部リソース読み込みなし）をキャッシュから読む
      source={{ uri: state.uri }}
      originWhitelist={["*"]}
      allowFileAccess
      allowFileAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      // WebGL の描画が真っ黒になるのを防ぐ
      androidLayerType="hardware"
      onMessage={(event) => {
        const result = parseBabylonEvent(event.nativeEvent.data);
        if ("errors" in result) {
          console.warn("[babylon-spike] 不正なイベント:", result.errors, event.nativeEvent.data);
          return;
        }
        console.log("[babylon-spike] WebView → RN:", result.event);
        onEvent?.(result.event);
      }}
      onError={(event) => {
        console.warn("[babylon-spike] WebView エラー:", event.nativeEvent);
      }}
      style={{ flex: 1, backgroundColor: "#87ceeb" }}
    />
  );
});
