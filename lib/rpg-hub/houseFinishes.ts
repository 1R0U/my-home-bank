// 自分の家の中の壁紙・床板（Issue #480）。
//
// 壁紙・床板はストアで買い、「かざる」の「かべ」「ゆか」のタブで選ぶ。最初の壁紙・床板（`starter`）は
// 家に付いているもので、はじめから持っている扱いにする（ストアには並べない）。
// 選んだものは利用者ごとに house_interior_settings へ保存し、置いた装飾・家具の配置と同じく
// **見る人ごと**の見た目にする（家族の家を訪ねても、自分の選んだ壁紙・床板で見える）。
//
// 見た目（色と柄）はここで持ち、形は houseInteriorParts.ts が組み立てる。カタログ（catalog.ts）は
// ここの一覧から壁紙・床板のエントリを作る。
//
// WebView のシーンからも読まれるので、mapObjects.ts と catalog.ts を読み込まない。
// 引数での分割代入も使わない（es2017 向けのバンドルで変換できないため）。

import type { AssetId, MapObject } from "../../types/map";
import type { FinishLook, FlooringPattern, WallpaperPattern } from "./houseInteriorParts.ts";

/** 壁紙か床板か。ストアの商品の種類（`store_assets.kind`）と同じ値 */
export type HouseFinishKind = "flooring" | "wallpaper";

/** 壁紙・床板1つぶん */
export type HouseFinish<P extends string> = {
  /** アセットID（`wallpaper-` / `flooring-` で始める） */
  id: string;
  /** 画面に出す名前。子供が読むので漢字を使わない */
  label: string;
  look: FinishLook<P>;
  /** 家に付いている最初の壁紙・床板。ストアに並べず、はじめから選べる */
  starter?: true;
};

/** 壁紙の一覧。最初の1つが家に付いている壁紙 */
export const WALLPAPERS: readonly HouseFinish<WallpaperPattern>[] = [
  { id: "wallpaper-plaster", label: "しっくい", look: { base: "#fbeed7", line: "#efdcbc", pattern: "plain" }, starter: true },
  { id: "wallpaper-wood", label: "きのいた", look: { base: "#d9b48a", line: "#b38759", pattern: "boards" } },
  { id: "wallpaper-brick", label: "れんが", look: { base: "#c7765c", line: "#ead2bd", pattern: "bricks" } },
  { id: "wallpaper-flower", label: "はなもよう", look: { base: "#fde4ec", line: "#f28fb0", pattern: "dots" } },
];

/** 床板の一覧。最初の1つが家に付いている床板 */
export const FLOORINGS: readonly HouseFinish<FlooringPattern>[] = [
  { id: "flooring-wood", label: "きのゆか", look: { base: "#d9a46a", line: "#b9834b", pattern: "planks" }, starter: true },
  { id: "flooring-dark-wood", label: "こいきのゆか", look: { base: "#8f5d38", line: "#6b4226", pattern: "planks" } },
  { id: "flooring-stone", label: "いしだたみ", look: { base: "#c9c3b5", line: "#a19a89", pattern: "tiles" } },
  { id: "flooring-tatami", label: "たたみ", look: { base: "#cdd497", line: "#8e9a55", pattern: "tiles" } },
];

const FINISHES_BY_KIND: Record<HouseFinishKind, readonly HouseFinish<string>[]> = {
  flooring: FLOORINGS,
  wallpaper: WALLPAPERS,
};

/** 選んでいる壁紙・床板 */
export type HouseFinishes = { flooringId: string; wallpaperId: string };

/** 家に付いている最初の壁紙・床板 */
export const STARTER_HOUSE_FINISHES: HouseFinishes = {
  flooringId: FLOORINGS[0].id,
  wallpaperId: WALLPAPERS[0].id,
};

/**
 * アセットIDから、壁紙・床板を引く。
 * @param id - アセットID（外部から来た文字列でもよい）
 * @returns 壁紙・床板と、その種類。どちらでもなければ null
 */
export function findHouseFinish(id: string): { finish: HouseFinish<string>; kind: HouseFinishKind } | null {
  for (const kind of Object.keys(FINISHES_BY_KIND) as HouseFinishKind[]) {
    const finish = FINISHES_BY_KIND[kind].find((item) => item.id === id);
    if (finish) return { finish, kind };
  }
  return null;
}

/**
 * その種類の壁紙・床板か。
 * @param kind - 壁紙か床板か
 * @param id - アセットID
 * @returns その種類なら true
 */
export function isHouseFinishOf(kind: HouseFinishKind, id: string): boolean {
  return findHouseFinish(id)?.kind === kind;
}

/**
 * 「かざる」で選べる壁紙・床板（家に付いている1つと、持っているもの）。一覧の順に並べる。
 * @param kind - 壁紙か床板か
 * @param ownedAssetIds - 持っているアセットのID
 * @returns 選べる壁紙・床板
 */
export function getSelectableFinishes(kind: HouseFinishKind, ownedAssetIds: readonly string[]): HouseFinish<string>[] {
  const owned = new Set(ownedAssetIds);
  return FINISHES_BY_KIND[kind].filter((finish) => finish.starter || owned.has(finish.id));
}

/** 床のオブジェクトのid（houseInterior.ts が置く） */
export const HOUSE_FLOOR_OBJECT_ID = "house-floor";

/** 壁（奥・左）のオブジェクトのidの頭。`house-wall-back-0` のように番号が付く（houseInterior.ts が置く） */
export const HOUSE_WALL_OBJECT_PREFIXES: readonly string[] = ["house-wall-back-", "house-wall-left-"];

/**
 * 床・壁のオブジェクトの見た目を、選んでいる壁紙・床板にする。
 * 最初の壁紙・床板のままなら、同じ一覧をそのまま返す（作り直さない）。
 * @param objects - マップオブジェクト（床・壁は最初の壁紙・床板のもの）
 * @param finishes - 選んでいる壁紙・床板
 * @returns 床・壁の見た目を替えた一覧
 */
export function applyHouseFinishes(objects: readonly MapObject[], finishes: HouseFinishes): MapObject[] {
  const wallpaper = isHouseFinishOf("wallpaper", finishes.wallpaperId) ? finishes.wallpaperId : STARTER_HOUSE_FINISHES.wallpaperId;
  const flooring = isHouseFinishOf("flooring", finishes.flooringId) ? finishes.flooringId : STARTER_HOUSE_FINISHES.flooringId;
  if (wallpaper === STARTER_HOUSE_FINISHES.wallpaperId && flooring === STARTER_HOUSE_FINISHES.flooringId) return [...objects];
  return objects.map((object) => {
    if (object.id === HOUSE_FLOOR_OBJECT_ID) return { ...object, model: flooring as AssetId };
    if (HOUSE_WALL_OBJECT_PREFIXES.some((prefix) => object.id.startsWith(prefix))) {
      return { ...object, model: wallpaper as AssetId };
    }
    return object;
  });
}
