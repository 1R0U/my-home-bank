import { Asset } from "expo-asset";
import { File } from "expo-file-system";

// RPGハブの WebView に渡すアセット（txt）を読むための共通処理。
// 我が家タウン（RpgHubWebView）と肖像（PortraitRenderer、Issue #306）の両方で使う。

/**
 * アセット（txt）の中身を文字列として読み出す。
 * @param moduleRef - require したアセットモジュール
 * @param label - エラーメッセージ用のラベル
 * @returns アセットの中身
 */
export async function readAssetText(moduleRef: number, label: string): Promise<string> {
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  const source = asset.localUri ?? asset.uri;
  if (!source) throw new Error(`${label} のローカルURIを解決できませんでした`);
  return new File(source).text();
}
