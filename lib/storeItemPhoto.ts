import type { StoreItem } from "../types";

export type StoreItemPhotoSource = number | { uri: string };

/** 登録済みの写真を優先し、写真未設定の「おかし」には同梱したフリー素材を使う。 */
export function getStoreItemPhoto(item?: Pick<StoreItem, "title" | "image_url" | "asset_id">): StoreItemPhotoSource | null {
  if (!item) return null;
  if (item.image_url?.trim()) return { uri: item.image_url };
  if (!item.asset_id && ["おかし", "お菓子"].includes(item.title.trim())) {
    return require("../assets/store/snacks.jpg");
  }
  return null;
}
