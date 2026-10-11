import type { MapObject, MapRouteId } from "../../types/map.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { ASSET_CATALOG } from "./catalog.ts";
import { HOUSE_ZONE_BOUNDS } from "./mapObjects.ts";
import { TOWN_CAMERA_OFFSET } from "./townCamera.ts";

export type MinimapLocation = "ground" | "town" | "upstairs";

export type MinimapBounds = { maxX: number; maxZ: number; minX: number; minZ: number };

/**
 * 画面の向きの基準ベクトル。`townCamera.ts` の `screenToWorldDirection`（Issue #379、
 * スティック入力→ワールド移動量）と同じ考え方で、`TOWN_CAMERA_OFFSET` から求める
 * （1R0Uさんレビュー指摘：マップの向きを3D画面に合わせること）。
 *
 * - 画面の上 = カメラから見た奥 = オフセットと逆向き
 * - 画面の右 = 奥 × 上（右手系）
 *
 * `screenToWorldDirection` は「画面の入力→ワールドの移動量」で逆方向の変換だが、
 * **同じ `TOWN_CAMERA_OFFSET` を基準にする**ことで、カメラの向きを変えても
 * 両方が一緒に追従する（値を個別に書くと、片方だけ直し忘れてずれる）。
 */
const CAMERA_HORIZONTAL_LENGTH = Math.hypot(TOWN_CAMERA_OFFSET.x, TOWN_CAMERA_OFFSET.z);
const SCREEN_UP =
  CAMERA_HORIZONTAL_LENGTH > 0
    ? { x: -TOWN_CAMERA_OFFSET.x / CAMERA_HORIZONTAL_LENGTH, z: -TOWN_CAMERA_OFFSET.z / CAMERA_HORIZONTAL_LENGTH }
    : { x: 0, z: -1 };
const SCREEN_RIGHT = { x: -SCREEN_UP.z, z: SCREEN_UP.x };

/**
 * マップ上に描く物（道タイルなど）を、`toScreenPlane` と同じだけ回して見た目を合わせる角度
 * （度、CSSの `rotate` にそのまま渡す）。1R0Uさんレビュー指摘：マップ自体は回転させたのに、
 * 道タイルは正方形のまま（回転させずに）描いていたため、まっすぐな道がギザギザに見えていた。
 *
 * ワールドの+X方向（タイルの元の右辺）が、回転後は画面のどの向きを指すかから求める
 * （`facingYToRotationDeg` と同じ、「ローカル(1,0)がCSS rotate(θ)でscreen(cosθ,sinθ)を指す」関係）。
 */
export const MINIMAP_ROTATION_DEG = (Math.atan2(-SCREEN_UP.x, SCREEN_RIGHT.x) * 180) / Math.PI;

/**
 * ワールド座標（x, z）を、画面の向きに合わせた平面座標へ変換する。
 * @param x - ワールドX座標
 * @param z - ワールドZ座標
 * @returns 画面の向きに合わせた平面座標（right: 右方向, forward: 下方向）
 */
function toScreenPlane(x: number, z: number): { forward: number; right: number } {
  return {
    // 画面の下向きが正になるよう、SCREEN_UP（上向き）への投影を反転する
    forward: -(x * SCREEN_UP.x + z * SCREEN_UP.z),
    right: x * SCREEN_RIGHT.x + z * SCREEN_RIGHT.z,
  };
}

/**
 * 町の表示半幅。プレイヤーを中心に、この半幅ぶんだけ画面に合わせた平面座標で正方形に切り出す
 * （1R0Uさんレビュー指摘：歩ける範囲に制限がなく、固定範囲だとプレイヤーが外に出ると表示が
 * おかしくなるため、ミニマップとして一般的な「プレイヤー中心」にする）。
 */
const TOWN_HALF_WIDTH = 30;

/** 家の中（1階・2階）は壁の外周（`HOUSE_ZONE_BOUNDS`）そのままだと壁際が見切れるため、少し広げる。 */
const HOUSE_PADDING = 2;

function withPadding(bounds: MinimapBounds, padding: number): MinimapBounds {
  return {
    maxX: bounds.maxX + padding,
    maxZ: bounds.maxZ + padding,
    minX: bounds.minX - padding,
    minZ: bounds.minZ - padding,
  };
}

/**
 * ワールド座標の矩形（軸に平行）を画面の向きに合わせた平面へ回転させ、
 * その4隅を囲む新しい軸平行の矩形を返す。
 * @param bounds - ワールド座標の矩形
 * @returns 画面の向きに合わせた平面上の矩形
 */
function rotateBoundsToScreenPlane(bounds: MinimapBounds): MinimapBounds {
  const corners = [
    toScreenPlane(bounds.minX, bounds.minZ),
    toScreenPlane(bounds.minX, bounds.maxZ),
    toScreenPlane(bounds.maxX, bounds.minZ),
    toScreenPlane(bounds.maxX, bounds.maxZ),
  ];
  return {
    maxX: Math.max(...corners.map((c) => c.right)),
    maxZ: Math.max(...corners.map((c) => c.forward)),
    minX: Math.min(...corners.map((c) => c.right)),
    minZ: Math.min(...corners.map((c) => c.forward)),
  };
}

/**
 * 正方形ではない矩形を、中心を保ったまま短い辺を広げて正方形にする
 * （1R0Uさんレビュー指摘：正方形でない範囲を正方形のマップへ描くと、縦横の比率が
 * 現実と変わってしまう）。
 * @param bounds - 矩形
 * @returns 中心が同じ正方形
 */
function squareify(bounds: MinimapBounds): MinimapBounds {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
  return { maxX: centerX + half, maxZ: centerZ + half, minX: centerX - half, minZ: centerZ - half };
}

/**
 * 今いる区画（`getHouseLocation` の戻り値）から、マップに映す範囲を決める。
 * 返る範囲は、あらかじめ画面の向きに合わせて回転させた平面座標（`toScreenPlane`）。
 * `projectToMinimap` もこの平面へ座標を変換してから使うこと。
 *
 * - 家の中・2階: 壁の外周（`HOUSE_ZONE_BOUNDS`）を回転・正方形化した固定範囲。
 * - 町: 歩ける範囲に上限が無いため、プレイヤーを中心にした固定幅の正方形
 *   （スクロールするミニマップと同じ考え方）。
 * @param location - 今いる区画
 * @param player - プレイヤーの座標（町のときだけ使う）
 * @returns 画面の向きに合わせた平面上の表示範囲
 */
export function getMinimapBounds(location: MinimapLocation, player: { x: number; z: number }): MinimapBounds {
  if (location === "ground") {
    return squareify(rotateBoundsToScreenPlane(withPadding(HOUSE_ZONE_BOUNDS.ground, HOUSE_PADDING)));
  }
  if (location === "upstairs") {
    return squareify(rotateBoundsToScreenPlane(withPadding(HOUSE_ZONE_BOUNDS.upstairs, HOUSE_PADDING)));
  }

  const center = toScreenPlane(player.x, player.z);
  return {
    maxX: center.right + TOWN_HALF_WIDTH,
    maxZ: center.forward + TOWN_HALF_WIDTH,
    minX: center.right - TOWN_HALF_WIDTH,
    minZ: center.forward - TOWN_HALF_WIDTH,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * ワールド座標（x, z）が、表示範囲（`getMinimapBounds` の戻り値）の内側かどうかを判定する。
 *
 * 町のマップはプレイヤーを中心にスクロールする固定幅のため、範囲外の建物・NPC・装飾・道も
 * 存在する。`projectToMinimap` は範囲外の座標を端へクランプして描けてしまうが、それだと
 * 実際に端にあるものと区別できなくなる（CodeRabbitレビュー指摘）。描く前にこれで絞り込むこと。
 * @param x - ワールドX座標
 * @param z - ワールドZ座標
 * @param bounds - 表示範囲（`getMinimapBounds` の戻り値。回転済み）
 * @returns 表示範囲の内側なら true
 */
export function isWithinMinimapBounds(x: number, z: number, bounds: MinimapBounds): boolean {
  const { forward, right } = toScreenPlane(x, z);
  return right >= bounds.minX && right <= bounds.maxX && forward >= bounds.minZ && forward <= bounds.maxZ;
}

/**
 * ワールド座標（x, z）を、正方形マップ（`size` ピクセル四方）上の位置へ変換する。
 * 画面の向きに合わせて回転させてから、範囲（`getMinimapBounds` が返す、回転済みの範囲）に
 * 当てはめる。範囲の外に出ていても、縁にはみ出さずマップの端に留める
 * （描く前に `isWithinMinimapBounds` で絞り込んでいること。でないと範囲外のものが
 * 端に重なって描かれ、実際に端にあるものと区別できない）。
 * @param x - ワールドX座標
 * @param z - ワールドZ座標
 * @param bounds - 表示範囲（`getMinimapBounds` の戻り値。回転済み）
 * @param size - マップの一辺（ピクセル）
 * @returns マップ上の位置（左上原点、ピクセル）
 */
export function projectToMinimap(
  x: number,
  z: number,
  bounds: MinimapBounds,
  size: number,
): { left: number; top: number } {
  const { forward, right } = toScreenPlane(x, z);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const left = clamp(((right - bounds.minX) / spanX) * size, 0, size);
  const top = clamp(((forward - bounds.minZ) / spanZ) * size, 0, size);
  return { left, top };
}

/**
 * プレイヤーの向き（`facingY`、ラジアン）を、矢印アイコン（デフォルトで上向き）を
 * 回すための角度（度、CSSの `rotate` にそのまま渡す）に直す。
 *
 * `facingY` は `movement.ts` の `atan2(dirX, dirZ)` という決め方（0が+Z、正面方向の
 * ベクトルは `(sin(facingY), cos(facingY))`）。マップは `toScreenPlane` と同じ向きに
 * 合わせるため、この正面ベクトルも同じ回転をかけてから画面上の角度を求める
 * （1R0Uさんレビュー指摘：マップの向きを3D画面に合わせるなら、矢印の回転も合わせる必要がある）。
 * @param facingY - 向き（ラジアン）
 * @returns 矢印の回転角（度）
 */
export function facingYToRotationDeg(facingY: number): number {
  const { forward, right } = toScreenPlane(Math.sin(facingY), Math.cos(facingY));
  // 上向きの矢印（画面上で (0, -1) 方向）を基準に、(right, forward) を向くための角度。
  return (Math.atan2(right, -forward) * 180) / Math.PI;
}

/** 建物（route）ごとのマップアイコン。新しいルートを増やすと型エラーで気づける。 */
export const BUILDING_MAP_ICONS: Record<MapRouteId, string> = {
  bank: "🏦",
  board: "🔔",
  downstairs: "🪜",
  history: "📜",
  house: "🏠",
  store: "🏪",
  tasks: "📋",
  upstairs: "🪜",
  wardrobe: "🪞",
};

/**
 * 建物（route）ごとの日本語ラベル。全体マップ（`HubMapView.tsx`）と
 * 2D比較画面（`ChildHomeScreen2D.tsx`）の両方で使う、唯一の定義（1R0Uさんレビュー指摘：
 * 2か所に同じ内容があり、`Record<string, string>` では新しいルートを増やしても
 * 型エラーで気づけなかった）。
 */
export const BUILDING_MAP_LABELS: Record<MapRouteId, string> = {
  bank: "銀行",
  board: "掲示板",
  downstairs: "下りる階段",
  history: "履歴",
  house: "自分の家",
  store: "ストア",
  tasks: "タスク",
  upstairs: "上る階段",
  wardrobe: "姿見",
};

export const NPC_MAP_ICON = "🙂";
export const DECORATION_MAP_ICON = "✨";

/** 道タイル1枚のワールド座標上の一辺（`catalog.ts` の道の `placement.size` と同じ）。 */
export const PATH_TILE_WORLD_SIZE = ASSET_CATALOG.path.placement.size;

/**
 * 道のタイルかどうかを判定する（マップに地面の目印として描くため）。
 * @param object - マップオブジェクト
 * @returns 道のタイルなら true
 */
export function isPathTile(object: MapObject): boolean {
  return object.type === "decoration" && object.model === RPG_HUB_ASSETS.path;
}

/**
 * ワールド座標上の長さ（例: 道タイルの一辺）を、マップ（`size` ピクセル四方）上の
 * ピクセル幅・高さに直す。`getMinimapBounds` は常に正方形を返すため、回転・拡大率は
 * X/Zで同じになる。
 * @param worldSize - ワールド座標上の長さ
 * @param bounds - 表示範囲
 * @param size - マップの一辺（ピクセル）
 * @returns マップ上の幅・高さ（ピクセル）
 */
export function worldSizeToMinimapPixels(
  worldSize: number,
  bounds: MinimapBounds,
  size: number,
): { height: number; width: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  return { height: (worldSize / spanZ) * size, width: (worldSize / spanX) * size };
}
