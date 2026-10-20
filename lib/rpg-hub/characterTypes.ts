// プレイヤーキャラクターの見た目の種類（形）を扱う（Issue #287）。
//
// 色（palette.ts）とは別の軸。こちらは「カエル／ねこ／リス」のような形そのものを選ぶ。
// DB（character_appearances.character_type）に保存する値と、カタログのアセットIDを
// 結びつける対応表をここに1か所だけ持つ。

import { RPG_HUB_ASSETS } from "./assets.ts";
import type { BuildingPart } from "./buildingParts.ts";
import { getBuildingParts } from "./catalog.ts";
import { getPartsHalfExtent } from "./partExtent.ts";
import type { AssetId, PaletteSlot } from "../../types/map";

/** キャラクターの種類。増やすときは、対応する形を先にカタログへ足してから追加する。 */
export type CharacterType = "hamster" | "cat" | "dog" | "frog" | "panda" | "rabbit";

/** 選べる種類の一覧。表示順もこの並びにする。 */
export const CHARACTER_TYPES: readonly CharacterType[] = ["frog", "rabbit", "cat", "dog", "hamster", "panda"];

/** 何も選んでいない人の既定値。DB側の `character_type` の default と揃える。 */
export const DEFAULT_CHARACTER_TYPE: CharacterType = "frog";

/** 選択画面などに出す日本語ラベル。子供が読むので漢字を使わない。 */
export const CHARACTER_TYPE_LABELS: Record<CharacterType, string> = {
  cat: "ねこ",
  dog: "いぬ",
  frog: "かえる",
  // 中の値は hamster のまま、表示名だけ「リス」にしてある（Issue #446）。
  // 見た目がリスに近かったため。DBに保存済みの値や制約を変えずに済むよう、値は変えない
  hamster: "リス",
  panda: "パンダ",
  rabbit: "うさぎ",
};

/**
 * 種類ごとのカタログのアセットID。
 * WebView 側でこのIDから `getBuildingParts` / アンカーを引いて見た目を組み立てる。
 */
export const CHARACTER_TYPE_ASSET_IDS: Record<CharacterType, AssetId> = {
  cat: RPG_HUB_ASSETS.playerCat,
  dog: RPG_HUB_ASSETS.playerDog,
  frog: RPG_HUB_ASSETS.player,
  hamster: RPG_HUB_ASSETS.playerHamster,
  panda: RPG_HUB_ASSETS.playerPanda,
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
 * そのキャラクターの、色の枠ごとの元の色（パーツ定義の色）を返す（Issue #381）。
 *
 * 更衣室の「もとのいろ」の見本に使う。色の候補（`PALETTE_COLOR_OPTIONS`）には、
 * うさぎの白・ねこの橙のような各キャラクターの元の色が入っていないため、見本の色は
 * パーツ定義から引く。その枠を使う最初のパーツの色を、見本の代表色として返す。
 * うさぎ・リスのさしいろには複数の元の色がある。実際の「もとのいろ」の描画では、
 * この代表色で揃えず、色の差し替えを外して各パーツの元の色をそのまま使う。
 * @param characterType - キャラクターの種類
 * @param slot - 色の枠
 * @returns 元の色の見本に使う代表色（#rrggbb）。その枠を使うパーツが無ければ null
 */
export function getDefaultPaletteColor(characterType: CharacterType, slot: PaletteSlot): string | null {
  const part = getBuildingParts(CHARACTER_TYPE_ASSET_IDS[characterType]).find(
    (candidate) => candidate.paletteSlot === slot,
  );
  return part ? part.color : null;
}

/**
 * キャラクターの足元の高さ。これまでのプレイヤーと同じく、地面（y = -0.08）のわずか上に立たせる。
 * 住人（VILLAGER_PARTS）の足元も同じ高さにそろえてある（mapObjects.ts の createNpc）。
 */
const CHARACTER_FOOT_Y = -0.05;

/**
 * そのアセットが、選べるキャラクターのどの種類かを返す。
 *
 * 家族NPCの歩き方をプレイヤーとそろえるのに使う（npcWander.ts）。形が同じなら、
 * 足の長さも同じなので、歩き方も同じにしないと足が滑って見える（Issue #473）。
 * @param assetId - アセットID
 * @returns キャラクターの種類。選べるキャラクターでなければ null
 */
export function getCharacterTypeOfAsset(assetId: AssetId): CharacterType | null {
  return CHARACTER_TYPES.find((type) => CHARACTER_TYPE_ASSET_IDS[type] === assetId) ?? null;
}

/**
 * そのキャラクターの足底の、原点からの高さ（拡大率1）を、足のパーツから求める。
 *
 * **パーツ定義から計算し、値を書き写さない。** 体の足の高さを変えたときに、
 * ここだけ古い値が残ってプレイヤーも家族NPCも浮く（沈む）ことになるため（PR #475 レビュー対応）。
 * 足（歩くときに振るパーツ）は回転を持たない決まりなので（buildingParts.ts の `LimbJoint`）、
 * 中心から高さの半分を引けば底になる。
 * @param characterType - キャラクターの種類
 * @returns 足底の高さ（負の値）
 */
function getFootBottomY(characterType: CharacterType): number {
  const feet = getBuildingParts(CHARACTER_TYPE_ASSET_IDS[characterType]).filter(
    (part) => part.limb?.kind === "foot",
  );
  return Math.min(...feet.map((part) => part.position.y - partHeight(part) / 2));
}

/**
 * パーツの高さ（回転前）。
 * @param part - パーツ
 * @returns 高さ
 */
function partHeight(part: BuildingPart): number {
  switch (part.shape) {
    case "sphere":
      return part.diameterY;
    case "torus":
      return part.thickness;
    default:
      return part.height;
  }
}

/**
 * そのキャラクターの当たり判定の一辺（拡大率1）を、見た目の広がりから求める。
 *
 * 家族NPCの当たり判定に使う（mapObjects.ts の createNpc）。見た目より当たり判定が小さいと、
 * プレイヤーや建物の壁がめり込んで見える（PR #475 レビュー対応）。
 * NPCは歩きながら向きを変えるので、X・Z の大きいほうを一辺とした正方形にする
 * （`getPartsHalfExtent` がそう返す）。耳や尻尾の回転も含めて測る。
 * @param characterType - キャラクターの種類
 * @returns 当たり判定の一辺
 */
export function getCharacterCollisionSide(characterType: CharacterType): number {
  return getPartsHalfExtent(getBuildingParts(CHARACTER_TYPE_ASSET_IDS[characterType])) * 2;
}

/**
 * 選べるキャラクターを置くときの、原点の高さを返す。
 *
 * パーツはローカル原点を中心に組んであるため、足底を足元の高さへ持ち上げる。
 * 拡大して描くと足底も同じ倍率で下がるので、そのぶん原点を持ち上げる。
 * プレイヤー（webview/rpg-hub/scene.ts）と家族NPC（mapObjects.ts の createNpc）の両方で使い、
 * 同じ種類・同じ大きさなら同じ高さに立つようにする（Issue #473）。
 * @param characterType - キャラクターの種類
 * @param scale - 描くときの拡大率
 * @returns 原点の高さ
 */
export function getCharacterCenterY(characterType: CharacterType, scale: number): number {
  return CHARACTER_FOOT_Y - getFootBottomY(characterType) * scale;
}
