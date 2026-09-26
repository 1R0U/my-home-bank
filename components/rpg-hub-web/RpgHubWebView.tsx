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
import type { CharacterType } from "../../lib/rpg-hub/characterTypes";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// どちらも postinstall で生成される（scripts/sync-babylon.mjs / scripts/build-rpg-scene.mjs）。
const babylonAsset = require("../../assets/babylon/babylon.txt");
const sceneAsset = require("../../assets/rpg-hub/scene.txt");

export type RpgHubWebHandle = {
  /** RN → WebView へ意図を送る。 */
  sendIntent: (intent: RpgHubIntent) => void;
};

type Props = {
  /**
   * プレイヤーの見た目の種類（Issue #287）。マウント時に一度だけ読み、
   * **その後この値が変わっても再生成しない**（PR #290レビュー対応）。
   * 呼び出し側（`RpgHubScreen`）は、DBからの読み込みが終わって値が確定するまで
   * このコンポーネント自体をマウントしないこと。選び直した種類は、次にこの
   * コンポーネントがマウントされたとき（我が家タウンを出入りしたとき）に反映される。
   */
  characterType: CharacterType;
  /** WebView からイベントを受け取ったときのコールバック。 */
  onEvent: (event: RpgHubEvent) => void;
  /** HTML の準備や WebView のロードに失敗したときのコールバック。 */
  onLoadError?: (message: string) => void;
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
 * @param characterType - プレイヤーの見た目の種類（Issue #287）
 * @returns 書き出した HTML の URI
 */
async function writeSceneHtml(characterType: CharacterType): Promise<string> {
  const [babylonSource, sceneSource] = await Promise.all([
    readAssetText(babylonAsset, "babylon.txt"),
    readAssetText(sceneAsset, "scene.txt"),
  ]);

  const html = buildRpgHubHtml(babylonSource, sceneSource, characterType);

  // characterType ごとにファイル名を分ける。共有の1ファイルだと、違う種類への
  // 書き込みが並行したときに片方の削除・書き込みがもう片方の内容を上書きしうる。
  const htmlFile = new File(Paths.cache, `rpg-hub-${characterType}.html`);
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(html);
  return htmlFile.uri;
}

/**
 * 進行中の生成処理。複数のマウントが重なっても、同じキャッシュファイルの
 * 削除と作成が競合しないよう1つに束ねる（`File.create()` は既定で上書き不可のため、
 * 競合すると後続がエラーになる）。characterType ごとに束ねる（違う値の生成中に
 * 前の値のPromiseを誤って返さないため）。
 */
const inFlight = new Map<CharacterType, Promise<string>>();

/**
 * HTML の生成を単一化して実行する。
 * @param characterType - プレイヤーの見た目の種類（Issue #287）
 * @returns 書き出した HTML の URI
 */
function prepareSceneHtml(characterType: CharacterType): Promise<string> {
  let promise = inFlight.get(characterType);
  if (!promise) {
    promise = writeSceneHtml(characterType).finally(() => {
      inFlight.delete(characterType);
    });
    inFlight.set(characterType, promise);
  }
  return promise;
}

export const RpgHubWebView = forwardRef<RpgHubWebHandle, Props>(function RpgHubWebView(
  { characterType, onEvent, onLoadError },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useImperativeHandle(ref, () => ({
    sendIntent: (intent) => {
      webViewRef.current?.postMessage(encodeIntent(intent));
    },
  }));

  // マウント時に一度だけ、そのときの characterType でHTMLを作る（Props の comment 参照）。
  // 依存配列を空にしているのは意図的：呼び出し側は読み込みが終わってからこの
  // コンポーネントをマウントする前提で、後から characterType が変わっても再生成しない。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    prepareSceneHtml(characterType)
      .then((uri) => {
        if (!cancelled) setState({ status: "ready", uri });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState({ message, status: "error" });
          onLoadErrorRef.current?.(message);
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
        const { description } = event.nativeEvent;
        const message = description || "WebView の読み込みに失敗しました";
        console.warn("[rpg-hub] WebView エラー:", event.nativeEvent);
        setState({ message, status: "error" });
        onLoadErrorRef.current?.(message);
      }}
      style={{ backgroundColor: "#dff4ff", flex: 1 }}
    />
  );
});
