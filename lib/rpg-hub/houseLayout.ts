// 自分の家の中の「もようがえ」（Issue #425）。
//
// 部屋にはじめから付いている物（扉・クローゼット・窓・階段。houseRoom.ts の `HOUSE_ROOMS`）に、
// 子供が置いた家具を足したものが、部屋の中身になる。
//
// - ソファ・ベッドなどの家具は、置く・動かす・しまうができる（いまは全部はじめから持っている扱い）
// - クローゼットは、しまえないが1階の中で置き場所を変えられる
// - 扉・階段・窓は動かせない
//
// 置き場所は「部屋の横幅に対する割合（0〜1）」で持つ（houseRoom.ts と同じ）。
// 床の上の家具どうしは重ならないようにする。壁に掛ける物（窓）とは重なってよい。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数と定数のみ。

import { HOUSE_FLOORS, HOUSE_ROOMS, ROOM_WIDTH, type HouseFloor, type HouseFurniture, type HouseFurnitureKind } from "./houseRoom.ts";
import { getFurnitureHalfWidth, HOUSE_FURNITURE_SHAPES } from "./houseRoomParts.ts";

/** もようがえで置ける家具の種類 */
export type HousePlaceableKind = "bed" | "bookshelf" | "plant" | "sofa" | "toyBox";

export type HousePlaceableFurniture = {
  /** もようがえの一覧に出す絵文字 */
  emoji: string;
  kind: HousePlaceableKind;
  /** 名前（子供が読むので、ひらがな中心） */
  label: string;
  /** 近づいて「しらべる」と、キャラクターが話すひとこと */
  reaction: string;
};

/** もようがえで置ける家具。一覧にはこの順に並べる */
export const HOUSE_PLACEABLE_FURNITURE: readonly HousePlaceableFurniture[] = [
  { emoji: "🛋️", kind: "sofa", label: "ソファ", reaction: "ふかふか〜" },
  { emoji: "🛏️", kind: "bed", label: "ベッド", reaction: "すやすや… zzz" },
  { emoji: "📚", kind: "bookshelf", label: "ほんだな", reaction: "なにを よもうかな" },
  { emoji: "🧸", kind: "toyBox", label: "おもちゃばこ", reaction: "いっしょに あそぼ！" },
  { emoji: "🪴", kind: "plant", label: "うえき", reaction: "おみずを あげよう" },
];

/** 置いた家具1つ。家具は種類ごとに1つずつ持っている（同じ種類は2つ置けない） */
export type PlacedHouseFurniture = {
  floor: HouseFloor;
  kind: HousePlaceableKind;
  /** 部屋の横幅に対する、家具の中心の位置（0〜1） */
  x: number;
};

/** 家の中の配置。端末の中に保存する（lib/houseLayoutStorage.ts） */
export type HouseLayout = {
  /** 1階のクローゼットの位置（部屋の横幅に対する割合） */
  closetX: number;
  placed: readonly PlacedHouseFurniture[];
};

const CLOSET_ID = "closet";
const PLACED_ID_PREFIX = "placed-";

/** 家具を1つも置いていない配置（クローゼットはまだ動かしていない位置） */
export const EMPTY_HOUSE_LAYOUT: HouseLayout = {
  closetX: HOUSE_ROOMS.ground.furniture.find((item) => item.id === CLOSET_ID)?.x ?? 0.27,
  placed: [],
};

/**
 * まだ配置を保存していない利用者の配置。
 *
 * もようがえを入れる前（Issue #386）に置いてあった家具を、同じ位置に置いた状態から始める。
 * 何も置いていない部屋から始めると、アップデートした時点で全員の部屋から家具が消えたように見えるため
 * （1R0Uレビュー指摘）。家具どうしの間に隙間（`FURNITURE_GAP`）を空けるため、1階のソファ（以前は 0.5）・
 * 植木（0.68）と2階のベッド（0.38）だけは、見て分からない程度に少しずらしている。
 */
export const DEFAULT_HOUSE_LAYOUT: HouseLayout = {
  closetX: EMPTY_HOUSE_LAYOUT.closetX,
  placed: [
    { floor: "ground", kind: "sofa", x: 0.497 },
    { floor: "ground", kind: "plant", x: 0.682 },
    { floor: "upstairs", kind: "bed", x: 0.39 },
    { floor: "upstairs", kind: "bookshelf", x: 0.62 },
    { floor: "upstairs", kind: "toyBox", x: 0.84 },
  ],
};

/**
 * 床の上の家具どうしの間に空ける隙間（割合）。ぴったりくっつけると、影が重なって1つの家具に見えるため。
 * 3Dの座標で 0.08 ぶん。
 */
const FURNITURE_GAP = 0.08 / ROOM_WIDTH;

/** 位置を比べるときの誤差の許し幅 */
const EPSILON = 1e-9;

function isPlaceableKind(value: unknown): value is HousePlaceableKind {
  return HOUSE_PLACEABLE_FURNITURE.some((item) => item.kind === value);
}

/**
 * 置いた家具のID。家具は種類ごとに1つなので、種類から決まる。
 * @param kind - 家具の種類
 * @returns 家具のID（例: placed-sofa）
 */
export function getPlacedFurnitureId(kind: HousePlaceableKind): string {
  return `${PLACED_ID_PREFIX}${kind}`;
}

/**
 * 置ける家具の説明を引く。
 * @param kind - 家具の種類
 * @returns 家具の説明
 */
export function getPlaceableFurniture(kind: HousePlaceableKind): HousePlaceableFurniture {
  return HOUSE_PLACEABLE_FURNITURE.find((item) => item.kind === kind) as HousePlaceableFurniture;
}

/**
 * 置いた家具のIDから種類を引く。
 * @param furnitureId - 家具のID
 * @returns 置いた家具なら種類。はじめから付いている物なら undefined
 */
function getPlacedKind(furnitureId: string): HousePlaceableKind | undefined {
  if (!furnitureId.startsWith(PLACED_ID_PREFIX)) return undefined;
  const kind = furnitureId.slice(PLACED_ID_PREFIX.length);
  return isPlaceableKind(kind) ? kind : undefined;
}

/**
 * その階の部屋の中身（はじめから付いている物と、置いた家具）。
 * @param floor - 階
 * @param layout - 家の中の配置
 * @returns 部屋の家具。はじめから付いている物が先、置いた家具が後
 */
export function getRoomFurniture(floor: HouseFloor, layout: HouseLayout): HouseFurniture[] {
  const fixed = HOUSE_ROOMS[floor].furniture.map((item) =>
    item.id === CLOSET_ID ? { ...item, x: layout.closetX } : item,
  );
  const placed = layout.placed
    .filter((item) => item.floor === floor)
    .map((item): HouseFurniture => {
      const info = getPlaceableFurniture(item.kind);
      return {
        action: "react",
        id: getPlacedFurnitureId(item.kind),
        kind: item.kind,
        label: info.label,
        reaction: info.reaction,
        x: item.x,
      };
    });
  return [...fixed, ...placed];
}

/**
 * もようがえで動かせる家具か（置いた家具とクローゼット）。
 * @param furnitureId - 家具のID
 * @returns 動かせるなら true
 */
export function isMovableFurniture(furnitureId: string): boolean {
  return furnitureId === CLOSET_ID || getPlacedKind(furnitureId) !== undefined;
}

/**
 * もようがえでしまえる家具か（置いた家具だけ。クローゼットは家に必ず1つ置く）。
 * @param furnitureId - 家具のID
 * @returns しまえるなら true
 */
export function isStorableFurniture(furnitureId: string): boolean {
  return getPlacedKind(furnitureId) !== undefined;
}

/**
 * 家具を置ける位置のうち、置きたい位置にいちばん近いところを探す。
 *
 * 部屋の左右の壁からはみ出さず、床の上のほかの家具とも重ならない位置を選ぶ。
 * 置きたい位置がふさがっていれば、ふさいでいる家具のすぐ左か右へずらす。
 * @param floor - 階
 * @param layout - 家の中の配置
 * @param kind - 置く家具の種類
 * @param desiredX - 置きたい位置（割合）
 * @param ignoreId - 重なりを調べないで済ませる家具のID（動かしている家具そのもの）
 * @returns 置ける位置（割合）。どこにも置けなければ null
 */
export function findFreeX(
  floor: HouseFloor,
  layout: HouseLayout,
  kind: HouseFurnitureKind,
  desiredX: number,
  ignoreId?: string,
): number | null {
  if (!Number.isFinite(desiredX)) return null;
  const half = getFurnitureHalfWidth(kind) / ROOM_WIDTH;
  if (half * 2 > 1) return null;
  const obstacles = getRoomFurniture(floor, layout)
    .filter((item) => item.id !== ignoreId && !HOUSE_FURNITURE_SHAPES[item.kind].onWall)
    .map((item) => ({ minDistance: half + getFurnitureHalfWidth(item.kind) / ROOM_WIDTH + FURNITURE_GAP, x: item.x }));

  const isFree = (x: number) =>
    x - half >= -EPSILON &&
    x + half <= 1 + EPSILON &&
    obstacles.every((obstacle) => Math.abs(x - obstacle.x) >= obstacle.minDistance - EPSILON);

  const candidates = [
    Math.min(1 - half, Math.max(half, desiredX)),
    ...obstacles.flatMap((obstacle) => [obstacle.x - obstacle.minDistance, obstacle.x + obstacle.minDistance]),
  ];
  let best: number | null = null;
  for (const candidate of candidates) {
    if (!isFree(candidate)) continue;
    if (best === null || Math.abs(candidate - desiredX) < Math.abs(best - desiredX)) best = candidate;
  }
  return best;
}

/**
 * 持っている家具を、その階に置く。置きたい位置がふさがっていれば、近くの空いている所に置く。
 * @param layout - 家の中の配置
 * @param floor - 置く階
 * @param kind - 置く家具の種類
 * @param desiredX - 置きたい位置（割合）
 * @returns 置いたあとの配置。もう置いてある・空いている所が無いときは null
 */
export function placeFurniture(
  layout: HouseLayout,
  floor: HouseFloor,
  kind: HousePlaceableKind,
  desiredX: number,
): HouseLayout | null {
  if (layout.placed.some((item) => item.kind === kind)) return null;
  const x = findFreeX(floor, layout, kind, desiredX);
  if (x === null) return null;
  return { ...layout, placed: [...layout.placed, { floor, kind, x }] };
}

/**
 * 家具を動かす。動かした先がふさがっていれば、近くの空いている所に置く。
 * @param layout - 家の中の配置
 * @param floor - 家具のある階
 * @param furnitureId - 動かす家具のID
 * @param desiredX - 動かしたい位置（割合）
 * @returns 動かしたあとの配置。動かせない家具・置ける所が無いときは、元の配置のまま
 */
export function moveFurniture(layout: HouseLayout, floor: HouseFloor, furnitureId: string, desiredX: number): HouseLayout {
  if (furnitureId === CLOSET_ID) {
    if (floor !== "ground") return layout;
    const x = findFreeX(floor, layout, "closet", desiredX, CLOSET_ID);
    return x === null ? layout : { ...layout, closetX: x };
  }
  const kind = getPlacedKind(furnitureId);
  if (!kind || !layout.placed.some((item) => item.kind === kind && item.floor === floor)) return layout;
  const x = findFreeX(floor, layout, kind, desiredX, furnitureId);
  if (x === null) return layout;
  return { ...layout, placed: layout.placed.map((item) => (item.kind === kind ? { ...item, x } : item)) };
}

/**
 * 置いた家具をしまう。クローゼットなど、しまえない物は何もしない。
 * @param layout - 家の中の配置
 * @param furnitureId - しまう家具のID
 * @returns しまったあとの配置
 */
export function storeFurniture(layout: HouseLayout, furnitureId: string): HouseLayout {
  const kind = getPlacedKind(furnitureId);
  if (!kind) return layout;
  return { ...layout, placed: layout.placed.filter((item) => item.kind !== kind) };
}

/**
 * まだ置いていない（しまってある）家具。もようがえの一覧に出す。
 * @param layout - 家の中の配置
 * @returns しまってある家具（一覧の順）
 */
export function getStoredFurniture(layout: HouseLayout): HousePlaceableFurniture[] {
  return HOUSE_PLACEABLE_FURNITURE.filter((item) => !layout.placed.some((placed) => placed.kind === item.kind));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 保存してあった配置・WebView へ送られてきた配置を読む。
 *
 * 壊れた値は捨てて、使える分だけを残す。家具の形を作り直して大きくなったときなどに、
 * 保存してあった位置では重なってしまう家具は、近くの空いている所へずらす（ずらせなければしまう）。
 * @param raw - 読んだ値
 * @returns 使える配置。まったく読めなければ、何も置いていない配置
 */
export function parseHouseLayout(raw: unknown): HouseLayout {
  if (!isRecord(raw)) return DEFAULT_HOUSE_LAYOUT;
  let layout: HouseLayout = EMPTY_HOUSE_LAYOUT;
  const closetX = typeof raw.closetX === "number" ? raw.closetX : EMPTY_HOUSE_LAYOUT.closetX;
  layout = { ...layout, closetX: findFreeX("ground", layout, "closet", closetX, CLOSET_ID) ?? EMPTY_HOUSE_LAYOUT.closetX };

  const placed = Array.isArray(raw.placed) ? raw.placed : [];
  for (const item of placed) {
    if (!isRecord(item) || !isPlaceableKind(item.kind) || typeof item.x !== "number") continue;
    if (!(HOUSE_FLOORS as readonly unknown[]).includes(item.floor)) continue;
    layout = placeFurniture(layout, item.floor as HouseFloor, item.kind, item.x) ?? layout;
  }
  return layout;
}
