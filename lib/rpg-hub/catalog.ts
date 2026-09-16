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
  GLASSES_PARTS,
  GRASS_FLOWER_PARTS,
  GRASS_PARTS,
  GRASS_TALL_PARTS,
  GRASS_WIDE_PARTS,
  HAT_PARTS,
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
import type { AssetId, EquipmentSlot } from "../../types/map";

/** アセットの種別。 */
export type AssetCategory = "building" | "character" | "decoration" | "wearable";

/**
 * キャラクターの装着位置（Issue #221）。
 *
 * **座標を持つのはキャラクターの側だけ。** 着せ替え品は「どの枠に付くか」しか知らない。
 * こうしておくと、仮置きのカエルを本番のキャラクターへ差し替えるときに、
 * ここのアンカーを定義し直すだけで済み、アイテムは1つも触らなくてよい。
 *
 * `scale` はアイテム側の基準の大きさに対する倍率。アイテムはカエルに合わせた寸法で
 * 作ってあるので、頭の小さいキャラクターはここで縮める。
 */
export type SlotAnchor = {
  position: { x: number; y: number; z: number };
  /** ラジアンでの回転。省略時は無回転 */
  rotation?: { x: number; y: number; z: number };
  /** 拡大率。省略時は 1 */
  scale?: number;
};

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
  /**
   * 着せ替え品を付けられる位置。`character` だけが持つ。
   *
   * **使われている枠はすべて用意すること。** 用意が漏れた枠のアイテムは黙って付かない
   * （テストが検出する）。
   */
  anchors?: Partial<Record<EquipmentSlot, SlotAnchor>>;
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
  /**
   * 着せ替え画面に出す名前。`wearable` だけが持つ。
   *
   * 子供が読むので漢字を使わない。画面側に表を作らずここへ置くのは、
   * アイテムを増やすときに編集するのがこのファイルだけ、という前提を保つため。
   */
  label?: string;
  /** 付く場所。`wearable` だけが持ち、**座標は持たない**（アンカーが決める） */
  slot?: EquipmentSlot;
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
  // size はタイルを隙間なく並べるときの間隔として mapObjects.ts の pathLine が読む。
  // **PATH_PARTS の板の一辺と同じ値にすること。** ずれると道に隙間や重なりが出る。
  path: {
    castsShadow: false,
    category: "decoration",
    id: "decoration-path",
    parts: PATH_PARTS,
    placement: { halfHeight: 0.03, size: 1.8, solid: false },
  },
  // カエルのアンカー。頭の箱は y が -0.22〜0.38、目のふくらみが 0.60 まで飛び出している。
  // 帽子は目より上（0.62）に載せ、めがねは眼球の前面（z = 0.30）に合わせる。
  player: {
    anchors: {
      face: { position: { x: 0, y: 0.48, z: 0.3 } },
      head: { position: { x: 0, y: 0.62, z: 0.12 } },
    },
    category: "character",
    id: "player-default",
    parts: PLAYER_PARTS,
  },
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
  // 住人のアンカー。カエルより頭が小さい（幅 0.42 対 0.8）ので scale で縮める。
  // **アイテム側は一切変えていない。** これがキャラクター差し替えの練習にもなっている。
  // face の 0.4 は、基準のレンズ間隔 ±0.25 を住人の目の位置 ±0.1 に合わせる倍率。
  villager: {
    anchors: {
      face: { position: { x: 0, y: 0.63, z: 0.21 }, scale: 0.4 },
      head: { position: { x: 0, y: 0.84, z: 0 }, scale: 0.62 },
    },
    category: "character",
    id: "character-villager",
    parts: VILLAGER_PARTS,
  },
  // --- 着せ替え品（Issue #221）。付く場所は slot だけで、座標は持たない ---
  wearableGlasses: {
    category: "wearable",
    id: "wearable-glasses",
    label: "めがね",
    parts: GLASSES_PARTS,
    slot: "face",
  },
  wearableHat: {
    category: "wearable",
    id: "wearable-hat",
    label: "ぼうし",
    parts: HAT_PARTS,
    slot: "head",
  },
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

/**
 * 装飾を地面に接するように置くための y 座標を返す。
 *
 * **保存しないこと。** カタログの `halfHeight` と大きさから毎回決める。
 * 保存してしまうと、形を作り直したときに古い高さのまま宙に浮く。
 * -0.05 は地面（y = -0.08）へわずかに沈める分で、接地面の隙間を消す。
 * @param halfHeight - ローカル原点から底面までの距離
 * @param scale - 拡大率
 * @returns position.y に入れる値
 */
export function groundedY(halfHeight: number, scale: number): number {
  return halfHeight * scale - 0.05;
}

/**
 * アセットIDから、装飾として置くときの寸法を引く。
 * @param assetId - アセットID（外部から来た文字列でもよい）
 * @returns 寸法。装飾でない、または未知のIDなら null
 */
export function getDecorationPlacement(assetId: string): DecorationPlacement | null {
  return DEFINITION_BY_ID.get(assetId)?.placement ?? null;
}

/**
 * キャラクターの装着位置を引く。
 * @param assetId - キャラクターのアセットID
 * @param slot - 装着する枠
 * @returns アンカー。キャラクターでない、またはその枠を持たないなら null
 */
export function getSlotAnchor(assetId: string, slot: EquipmentSlot): SlotAnchor | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "character") return null;
  return definition.anchors?.[slot] ?? null;
}

/**
 * 着せ替え品が付く枠を引く。
 * @param assetId - アセットID（外部から来た文字列でもよい）
 * @returns 付く枠。着せ替え品でない、または未知のIDなら null
 */
export function getWearableSlot(assetId: string): EquipmentSlot | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "wearable") return null;
  return definition.slot ?? null;
}

/**
 * 着せ替え品の表示名を引く。
 * @param assetId - アセットID
 * @returns 表示名。未知のIDなら null
 */
export function getWearableLabel(assetId: string): string | null {
  const definition = DEFINITION_BY_ID.get(assetId);
  if (!definition || definition.category !== "wearable") return null;
  return definition.label ?? null;
}
