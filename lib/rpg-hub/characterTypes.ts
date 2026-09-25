// プレイヤーキャラクターの見た目の種類（形）を扱う（Issue #287）。
//
// 色（palette.ts）とは別の軸。こちらは「カエル／ねこ／ハムスター」のような形そのものを選ぶ。
// DB（character_appearances.character_type）に保存する値と、カタログのアセットIDを
// 結びつける対応表をここに1か所だけ持つ。

import { RPG_HUB_ASSETS } from "./assets.ts";
import type { AssetId } from "../../types/map";

/** キャラクターの種類。増やすときは、対応する形を先にカタログへ足してから追加する。 */
export type CharacterType = "hamster" | "cat" | "frog";

/** 選べる種類の一覧。表示順もこの並びにする。 */
export const CHARACTER_TYPES: readonly CharacterType[] = ["frog", "cat", "hamster"];

/** 何も選んでいない人の既定値。DB側の `character_type` の default と揃える。 */
export const DEFAULT_CHARACTER_TYPE: CharacterType = "frog";

/** 選択画面などに出す日本語ラベル。子供が読むので漢字を使わない。 */
export const CHARACTER_TYPE_LABELS: Record<CharacterType, string> = {
  cat: "ねこ",
  frog: "かえる",
  hamster: "ハムスター",
};

/**
 * 種類ごとのカタログのアセットID。
 * WebView 側でこのIDから `getBuildingParts` / アンカーを引いて見た目を組み立てる。
 */
export const CHARACTER_TYPE_ASSET_IDS: Record<CharacterType, AssetId> = {
  cat: RPG_HUB_ASSETS.playerCat,
  frog: RPG_HUB_ASSETS.player,
  hamster: RPG_HUB_ASSETS.playerHamster,
};

/**
 * 値が有効なキャラクター種類かどうかを判定する。
 * @param value - 判定する値
 * @returns 有効な場合は true
 */
export function isCharacterType(value: unknown): value is CharacterType {
  return (
    typeof value === "string" && (CHARACTER_TYPES as readonly string[]).includes(value)
  );
}
