// プレイヤーキャラクターの見た目の種類（形）を扱う（Issue #287）。
//
// 色（palette.ts）とは別の軸。こちらは「カエル／ねこ／ハムスター」のような形そのものを選ぶ。
// DB（character_appearances.character_type）に保存する値と、カタログのアセットIDを
// 結びつける対応表をここに1か所だけ持つ。

import { RPG_HUB_ASSETS } from "./assets.ts";
import type { AssetId } from "../../types/map";
import type { Palette } from "./palette";

/** キャラクターの種類。増やすときは、対応する形を先にカタログへ足してから追加する。 */
export type CharacterType = "hamster" | "cat" | "frog" | "rabbit";

/** 選べる種類の一覧。表示順もこの並びにする。 */
export const CHARACTER_TYPES: readonly CharacterType[] = ["frog", "rabbit", "cat", "hamster"];

/** 何も選んでいない人の既定値。DB側の `character_type` の default と揃える。 */
export const DEFAULT_CHARACTER_TYPE: CharacterType = "frog";

/** 選択画面などに出す日本語ラベル。子供が読むので漢字を使わない。 */
export const CHARACTER_TYPE_LABELS: Record<CharacterType, string> = {
  cat: "ねこ",
  frog: "かえる",
  hamster: "ハムスター",
  rabbit: "うさぎ",
};

/**
 * 種類ごとのカタログのアセットID。
 * WebView 側でこのIDから `getBuildingParts` / アンカーを引いて見た目を組み立てる。
 */
export const CHARACTER_TYPE_ASSET_IDS: Record<CharacterType, AssetId> = {
  cat: RPG_HUB_ASSETS.playerCat,
  frog: RPG_HUB_ASSETS.player,
  hamster: RPG_HUB_ASSETS.playerHamster,
  rabbit: RPG_HUB_ASSETS.playerRabbit,
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

/**
 * 保存した色を当てないキャラクターへ渡す、固定の空パレット。
 *
 * 毎回 `{}` を作ると、レンダーのたびに新しい参照になる。依存配列に色を入れている
 * 送信effect（RpgHubScreen）や、見た目のキーを作るメモ（CharacterAvatar）が、
 * 色は変わっていないのに走り直してしまうため、1つの値を使い回す（PR #296レビュー対応）。
 */
const EMPTY_PALETTE: Palette = {};

/**
 * キャラクターに実際に当てる色を決める（PR #343 レビュー対応）。
 *
 * 色を選んで保存できるのは、いまはカエルを選んでいるときだけ（CharacterSelectScreen の
 * `canEditPalette`）。保存した色はキャラクターを替えてもDBに残るが、**カエル以外には当てない。**
 * 当てると、カエル用に選んだ色（緑など）がうさぎ・ねこ・ハムスターに付き、しかもその人は
 * 選び直せないため。カエル以外は、パーツ定義の既定の色で描く。
 *
 * 我が家タウン（RpgHubScreen）とアイコン（CharacterAvatar）の両方で使い、同じ見た目にそろえる。
 *
 * @param characterType - 描くキャラクターの種類
 * @param palette - 本人が保存した色
 * @returns 当てる色。カエル以外は空（既定の色のまま）
 */
export function getAppliedPalette(characterType: CharacterType, palette: Palette): Palette {
  return characterType === "frog" ? palette : EMPTY_PALETTE;
}
