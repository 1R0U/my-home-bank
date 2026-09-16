// RPGハブに出てくるアセットの一覧（Issue #220）。
//
// **アセットを1つ増やすときに編集するのはこのファイルだけ。**
// 以前は次の5か所に分かれており、どれか1つを書き忘れると静かに壊れていた。
//
//   1. assets.ts      RPG_HUB_ASSETS へIDを足す
//   2. buildingParts  *_PARTS に形を定義する
//   3. buildingParts  PARTS_BY_ASSET へ登録する
//   4. assets.ts      影を落とさないものは NO_SHADOW_ASSETS にも足す
//   5. mapObjects     装飾なら DECORATION_SPECS に大きさを足す
//
// 実際 4 は書き忘れが起きうるとして、assets.ts に注意書きとテストが後から入っていた。
// 着せ替え品と装飾品はこれから継続的に増やすため、1エントリで済む形にしてある。
//
// 形（parts）は buildingParts.ts に置いたまま。あちらは「形」、ここは「対応づけ」。

import {
  BANK_PARTS,
  BUSH_BERRY_PARTS,
  BUSH_PARTS,
  BUSH_TALL_PARTS,
  BUSH_WIDE_PARTS,
  FALLBACK_PARTS,
  FLOWERBED_PARTS,
  GRASS_FLOWER_PARTS,
  GRASS_PARTS,
  GRASS_TALL_PARTS,
  GRASS_WIDE_PARTS,
  HISTORY_PARTS,
  LAMP_PARTS,
  PATH_PARTS,
  PLAYER_PARTS,
  ROCK_FLAT_PARTS,
  ROCK_PARTS,
  ROCK_PILE_PARTS,
  ROCK_TALL_PARTS,
  STORE_PARTS,
  TASKS_PARTS,
  TREE_PARTS,
  TREE_PINE_PARTS,
  TREE_TALL_PARTS,
  TREE_YOUNG_PARTS,
  VILLAGER_PARTS,
  type BuildingPart,
} from "./buildingParts.ts";
import type { AssetId } from "../../types/map";

/**
 * アセットの種別。
 *
 * 着せ替え品（`wearable`）はまだ無い。#221 で装着スロットを入れるときに足す。
 */
export type AssetCategory = "building" | "character" | "decoration";

/**
 * 装飾として置くときの寸法。
 *
 * `size` は当たり判定の一辺で、**すべて正方形にする**。`isBlocked` は `rotationY` を
 * 反映しないため（#198）、正方形にしておけば回転させても見た目と判定がずれない。
 * 見た目より小さめにするのは、葉や花のような外側まで塞ぐと歩きにくいため。
 *
 * `halfHeight` はローカル原点から底面までの距離。パーツ定義の底面と合わせる。
 */
export type DecorationPlacement = {
  halfHeight: number;
  /** 当たり判定を持つか。`false` は踏んで歩ける（草むら・道） */
  solid?: false;
  size: number;
};

/** アセット1つ分の定義。 */
export type AssetDefinition = {
  category: AssetCategory;
  /**
   * 影を落とすか。省略時は落とす。
   *
   * 道のタイルは地面に貼りついた板なので、落とす側にすると自分の影で縞模様が出る。
   * 草むらは細すぎて影が点のノイズにしかならず、数のわりに影のパスを重くする。
   */
  castsShadow?: false;
  /** 外部から来た値の検証に使う文字列。将来DBに保存されるのもこの値 */
  id: string;
  parts: BuildingPart[];
  /** 装飾として置くときの寸法。`decoration()` で置くものだけが持つ */
  placement?: DecorationPlacement;
};

/**
 * アセットの一覧。**増やすときはここへ1エントリ足すだけ。**
 *
 * 自然物（木・低木・岩・草むら）は1種類につき4つの形を用意してある。
 * 同じ形だけを並べると、散らしても模様のように見えてしまうため
 * （置くときは lib/rpg-hub/mapObjects.ts がランダムに選ぶ）。
 */
export const ASSET_CATALOG = {
  bank: { category: "building", id: "building-bank", parts: BANK_PARTS },
  bush: {
    category: "decoration",
    id: "decoration-bush",
    parts: BUSH_PARTS,
    placement: { halfHeight: 0.4, size: 0.9 },
  },
  bushBerry: {
    category: "decoration",
    id: "decoration-bush-berry",
    parts: BUSH_BERRY_PARTS,
    placement: { halfHeight: 0.39, size: 0.9 },
  },
  bushTall: {
    category: "decoration",
    id: "decoration-bush-tall",
    parts: BUSH_TALL_PARTS,
    placement: { halfHeight: 0.4, size: 0.75 },
  },
  bushWide: {
    category: "decoration",
    id: "decoration-bush-wide",
    parts: BUSH_WIDE_PARTS,
    placement: { halfHeight: 0.3, size: 1.05 },
  },
  flowerbed: {
    category: "decoration",
    id: "decoration-flowerbed",
    parts: FLOWERBED_PARTS,
    placement: { halfHeight: 0.14, size: 1.7 },
  },
  grass: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass",
    parts: GRASS_PARTS,
    placement: { halfHeight: 0.3, size: 0.7, solid: false },
  },
  grassFlower: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-flower",
    parts: GRASS_FLOWER_PARTS,
    placement: { halfHeight: 0.26, size: 0.7, solid: false },
  },
  grassTall: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-tall",
    parts: GRASS_TALL_PARTS,
    placement: { halfHeight: 0.28, size: 0.6, solid: false },
  },
  grassWide: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-grass-wide",
    parts: GRASS_WIDE_PARTS,
    placement: { halfHeight: 0.22, size: 0.85, solid: false },
  },
  history: { category: "building", id: "building-history", parts: HISTORY_PARTS },
  lamp: {
    category: "decoration",
    id: "decoration-lamp",
    parts: LAMP_PARTS,
    placement: { halfHeight: 1, size: 0.4 },
  },
  // 道は歩く場所を示すもので、塞ぐためのものではない。当たり判定を持たせない。
  // size はタイルを隙間なく並べるときの間隔にも使う（mapObjects.ts の pathLine）。
  path: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-path",
    parts: PATH_PARTS,
    placement: { halfHeight: 0.03, size: 1.8, solid: false },
  },
  player: { category: "character", id: "player-default", parts: PLAYER_PARTS },
  rock: {
    category: "decoration",
    id: "decoration-rock",
    parts: ROCK_PARTS,
    placement: { halfHeight: 0.3, size: 0.9 },
  },
  rockFlat: {
    category: "decoration",
    id: "decoration-rock-flat",
    parts: ROCK_FLAT_PARTS,
    placement: { halfHeight: 0.21, size: 1.1 },
  },
  rockPile: {
    category: "decoration",
    id: "decoration-rock-pile",
    parts: ROCK_PILE_PARTS,
    placement: { halfHeight: 0.2, size: 0.85 },
  },
  rockTall: {
    category: "decoration",
    id: "decoration-rock-tall",
    parts: ROCK_TALL_PARTS,
    placement: { halfHeight: 0.46, size: 0.6 },
  },
  store: { category: "building", id: "building-store", parts: STORE_PARTS },
  tasks: { category: "building", id: "building-tasks", parts: TASKS_PARTS },
  tree: {
    category: "decoration",
    id: "decoration-tree",
    parts: TREE_PARTS,
    placement: { halfHeight: 0.9, size: 0.6 },
  },
  treePine: {
    category: "decoration",
    id: "decoration-tree-pine",
    parts: TREE_PINE_PARTS,
    placement: { halfHeight: 0.9, size: 0.6 },
  },
  treeTall: {
    category: "decoration",
    id: "decoration-tree-tall",
    parts: TREE_TALL_PARTS,
    placement: { halfHeight: 0.9, size: 0.5 },
  },
  treeYoung: {
    category: "decoration",
    id: "decoration-tree-young",
    parts: TREE_YOUNG_PARTS,
    placement: { halfHeight: 0.55, size: 0.45 },
  },
  villager: { category: "character", id: "character-villager", parts: VILLAGER_PARTS },
} satisfies Record<string, AssetDefinition>;

/** カタログの見出し（`bank` / `treePine` など）。 */
export type AssetKey = keyof typeof ASSET_CATALOG;

/**
 * カタログの全エントリ。
 *
 * `ASSET_CATALOG` は `satisfies` で1件ずつの型を保っており、そのまま走査すると
 * `castsShadow` を持たないエントリで型が合わない。まとめて読むときはこちらを使う。
 */
export const ASSET_DEFINITIONS: readonly AssetDefinition[] = Object.values(ASSET_CATALOG);

/** IDから定義を引く表。 */
const DEFINITION_BY_ID = new Map<string, AssetDefinition>(
  Object.values(ASSET_CATALOG).map((definition) => [definition.id, definition]),
);

/**
 * アセットIDに対応する見た目のパーツ一覧を返す。
 * 未知のIDでも描画が消えないようフォールバックを返す。
 * @param assetId - 解決済みのアセットID
 * @returns パーツ一覧
 */
export function getBuildingParts(assetId: AssetId): BuildingPart[] {
  return DEFINITION_BY_ID.get(assetId)?.parts ?? FALLBACK_PARTS;
}
