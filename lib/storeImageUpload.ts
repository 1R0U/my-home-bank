// 商品画像のアップロード（Issue #311）。
//
// 親のアイテム追加・子供の商品追加申請の両方から使う共通処理。
// 選んだ画像は端末内のURI（file://...）のままDBへ保存すると、選んだ端末以外
// （親の端末など）からは表示できない。Supabase Storage（store-item-images
// バケット、supabase/migrations/20261002000000_create_store_item_images_bucket.sql）へ
// アップロードし、どの端末からも見られるURLへ変換してから保存する。

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

const STORE_ITEM_IMAGES_BUCKET = "store-item-images";

/** 拡張子ごとのMIMEタイプ。ImagePickerが返すのはこの範囲のみを想定する。 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * URIの拡張子を取り出す。取り出せない場合はjpg扱いにする
 * （expo-image-pickerの既定の保存形式）。
 * @param uri - 画像のURI
 * @returns 小文字の拡張子（ドットなし）
 */
function extensionFromUri(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : "jpg";
}

/**
 * アップロード先のファイル名を作る。衝突を避けられればよく、暗号学的な強度は不要
 * （パス自体に家庭IDが入るため、当てられても他家庭の画像を覗けるわけではない）。
 * @param extension - 拡張子
 * @returns ファイル名
 */
function randomFileName(extension: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${random}.${extension}`;
}

/**
 * 端末内の画像（ImagePickerが返すURI）を商品画像用バケットへアップロードし、
 * どの端末からも見られる公開URLを返す。
 *
 * 保存先のパスは `{familyId}/{ファイル名}` に固定する。アップロードを許可する
 * INSERTポリシー（store_item_images_insert_own_family）が、先頭フォルダと
 * ログイン中利用者の家庭が一致するかを確認するため、familyId を正しく渡すこと。
 * @param localUri - ImagePickerが返した端末内URI
 * @param familyId - アップロードする利用者の家庭ID
 * @returns アップロード後の公開URL
 * @throws アップロードに失敗した場合、日本語メッセージのエラー
 */
export async function uploadStoreItemImage(
  localUri: string,
  familyId: string,
  client?: Pick<SupabaseClient, "storage">,
): Promise<string> {
  const resolvedClient = await resolveClient(client);
  const extension = extensionFromUri(localUri);
  const path = `${familyId}/${randomFileName(extension)}`;

  // RNのBlobは一部の環境でネットワーク越しに正しく送られない（0バイト・壊れた内容に
  // なることがある）既知の問題があるため、Blobではなく arrayBuffer を使う
  // （Supabaseの公式なReact Native向けの案内と同じ方法）。
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await resolvedClient.storage
    .from(STORE_ITEM_IMAGES_BUCKET)
    .upload(path, arrayBuffer, { contentType: CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream" });

  if (error) throw new Error("画像のアップロードに失敗しました。時間をおいて再度お試しください。");

  const { data } = resolvedClient.storage.from(STORE_ITEM_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 端末内だけで解決できるURI（file://...）かどうかを判定する。
 *
 * Issue #311でこのアップロード処理を導入する以前に保存された
 * `store_item_requests.image_url` は、申請した端末のローカルパスのままなので、
 * 別端末からは表示できない。アップロード後の公開URL（新しいデータ）と区別して、
 * 表示できない旨を伝えるために使う。
 * @param url - 画像のURL
 * @returns 端末内のみで解決できるURIなら true
 */
export function isLocalFileUri(url: string): boolean {
  return url.startsWith("file://");
}
