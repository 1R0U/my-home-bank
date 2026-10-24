/**
 * かざるの編集モード（Issue #477）で、カメラに映す範囲と映し方を決める。
 *
 * 編集モードの間はプレイヤーを追わず、**部屋全体（町では足元のまわり）を斜め上から見下ろす**。
 * 指で装飾を引っぱって置くので、置きたいマスが画面に入っていないと置けないため。
 * 普段の視点より高い所から見下ろし、奥の壁や家具に手前のマスが隠れにくくする。
 *
 * React Native / DOM / Babylon に依存しない純粋関数だけを持つ。WebView のシーン
 * （es2017 向けにバンドルする）からも読み込むので、引数での分割代入は使わない。
 */
import { getHouseLocation, HOUSE_GRID_ORIGIN } from "./houseInterior.ts";
import { getBuildingExitPoint } from "./movement.ts";
import type { MapObject } from "../../types/map";
import { HOUSE_ROOM_SIZE } from "./houseInteriorParts.ts";
import { TOWN_CELL_SIZE } from "./townGrid.ts";

/** 映す範囲（XZ平面）と、その中にある物のおおよその高さ。 */
export type EditArea = { height: number; maxX: number; maxZ: number; minX: number; minZ: number };

/** 画面の上下で、重ねたUIが隠している高さ（CSSピクセル）。この間に範囲を収める。 */
export type EditInsets = { bottom: number; top: number };

/**
 * 編集モードのカメラの、見る点からの位置。
 *
 * 普段（`TOWN_CAMERA_OFFSET` = (9, 11, 9)、見下ろす角度は約40度）と**同じ向き（+X+Z 側）から**、
 * より高い所（約62度）から見下ろす。向きを変えると、画面の上下左右と部屋の向きの関係が
 * 普段と変わり、どこに置いたか分かりにくくなるため。
 */
export const EDIT_CAMERA_OFFSET = { x: 6, y: 16, z: 6 } as const;

/** 町で編集モードにしたとき、足元から東西南北に何マスぶんを映すか。 */
export const TOWN_EDIT_HALF_CELLS = 7;

/** 町で映す物のおおよその高さ。木（2×2マス）の高さに合わせる。 */
const TOWN_EDIT_HEIGHT = 2;

/** 範囲のまわりに足す余白（範囲の大きさに対する割合）。端のマスが画面の縁に貼りつかないように。 */
const FIT_MARGIN = 0.08;

/**
 * 編集モードで映す範囲を決める。家の中なら部屋の床全体、町なら足元のマスのまわり。
 * @param player - プレイヤーの位置
 * @returns 映す範囲
 */
export function getEditArea(player: { x: number; z: number }): EditArea {
  if (getHouseLocation(player.x, player.z) === "house") {
    // 床の角（マス(0, 0)の角）から求める。中心から足し引きすると、小数の誤差で縁がマスの境目からずれる
    return {
      height: HOUSE_ROOM_SIZE.wallHeight,
      maxX: HOUSE_GRID_ORIGIN.x + HOUSE_ROOM_SIZE.width,
      maxZ: HOUSE_GRID_ORIGIN.z + HOUSE_ROOM_SIZE.depth,
      minX: HOUSE_GRID_ORIGIN.x,
      minZ: HOUSE_GRID_ORIGIN.z,
    };
  }
  // 町のマスの境目にそろえる。そろえないと、マス目の線が範囲の縁で途切れて見える
  const col = Math.floor(player.x / TOWN_CELL_SIZE);
  const row = Math.floor(player.z / TOWN_CELL_SIZE);
  return {
    height: TOWN_EDIT_HEIGHT,
    maxX: (col + 1 + TOWN_EDIT_HALF_CELLS) * TOWN_CELL_SIZE,
    maxZ: (row + 1 + TOWN_EDIT_HALF_CELLS) * TOWN_CELL_SIZE,
    minX: (col - TOWN_EDIT_HALF_CELLS) * TOWN_CELL_SIZE,
    minZ: (row - TOWN_EDIT_HALF_CELLS) * TOWN_CELL_SIZE,
  };
}

/**
 * 編集モードで、置けるかの判定に使うプレイヤーの位置。
 *
 * 編集モードの間はキャラクターを出さない（置く邪魔になるため）。見えないキャラクターにぶつかって
 * 置けないと理由が分からないので、**家の中では玄関（土間）の出口の前に立っているものとして扱う。**
 * 玄関はマス目（床）の外なので、どのマスにも置け、部屋の外まで行けるかもそこから確かめられる。
 * 編集モードを終えたとき、元の場所に物が置かれていたら、キャラクターをここへ移す（useDecorationEditor）。
 * 町には玄関に当たる場所が無いので、今の位置のまま。
 * @param player - プレイヤーの今の位置
 * @param objects - マップオブジェクト一覧
 * @returns 判定に使う位置（家の中では玄関の出口の前。向きも返す）
 */
export function getEditStandPoint(
  player: { x: number; z: number },
  objects: readonly MapObject[],
): { facingY: number; x: number; z: number } | { x: number; z: number } {
  if (getHouseLocation(player.x, player.z) !== "house") return player;
  const door = objects.find((object) => object.type === "building" && object.route === "exit");
  return door?.type === "building" ? getBuildingExitPoint(door) : player;
}

/**
 * 範囲の中心。カメラはここを見る。
 * @param area - 映す範囲
 * @returns 中心のXZ座標
 */
export function getEditAreaCenter(area: EditArea): { x: number; z: number } {
  return { x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2 };
}

/**
 * 範囲の8つの角（床の高さと、物の高さ）。カメラから見た位置に直して、画面に収まるかを測る。
 * @param area - 映す範囲
 * @returns 角の座標
 */
export function getEditAreaCorners(area: EditArea): { x: number; y: number; z: number }[] {
  const corners: { x: number; y: number; z: number }[] = [];
  for (const y of [0, area.height]) {
    for (const x of [area.minX, area.maxX]) {
      for (const z of [area.minZ, area.maxZ]) corners.push({ x, y, z });
    }
  }
  return corners;
}

/** 正射影カメラの映す範囲（カメラから見た座標。右が +x、上が +y）。 */
export type OrthoBounds = { bottom: number; left: number; right: number; top: number };

/**
 * 指で変えた見え方。`zoom` は範囲全体が収まる見え方（`fitOrthoToPoints`）からの倍率、
 * `pan` はそこからの中心のずれ（カメラから見た座標）。
 */
export type EditViewState = { pan: { x: number; y: number }; zoom: number };

/** 範囲全体が収まる見え方。家の中で編集モードを始めたときと「もとに もどす」でここへ戻す。 */
export const INITIAL_EDIT_VIEW: EditViewState = { pan: { x: 0, y: 0 }, zoom: 1 };

/**
 * 町で編集モードを始めたときの倍率。範囲全体（足元から東西南北7マス）が収まる見え方では
 * 引きすぎに見えた（Issue #509 の実機確認）ので、足元を拡大して始める。指で縮めれば範囲全体まで見られる。
 */
export const TOWN_EDIT_START_ZOOM = 1.6;

/**
 * 編集モードを始めたとき・「もとに もどす」を押したときの見え方。
 * 家の中は部屋全体、町は足元（範囲の真ん中）を拡大した見え方。
 * @param area - 映す範囲
 * @returns 見え方
 */
export function getStartEditView(area: EditArea): EditViewState {
  const center = getEditAreaCenter(area);
  if (getHouseLocation(center.x, center.z) === "house") return INITIAL_EDIT_VIEW;
  return { pan: { x: 0, y: 0 }, zoom: TOWN_EDIT_START_ZOOM };
}

/**
 * 拡大できる上限。マス（一辺0.9）が指より十分大きく見えるくらいまで。
 * 下限は1（範囲全体より小さくはしない。部屋の外を映しても置けないため）。
 */
export const MAX_EDIT_ZOOM = 3;

/**
 * 倍率を許す範囲に収め、ずれを「範囲全体が収まる見え方」の外へ出ない大きさに収める。
 *
 * 拡大した見え方が、いつも元の見え方の中にあるようにする。部屋の床が画面から外れて、
 * どこを見ているか分からなくなるのを防ぐ（倍率1ならずれは0になる）。
 * @param base - 範囲全体が収まる見え方
 * @param view - 指で変えた見え方
 * @returns 収めた見え方
 */
export function clampEditView(base: OrthoBounds, view: EditViewState): EditViewState {
  const zoom = Math.min(MAX_EDIT_ZOOM, Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const maxX = ((base.right - base.left) * (1 - 1 / zoom)) / 2;
  const maxY = ((base.top - base.bottom) * (1 - 1 / zoom)) / 2;
  // `+ 0` は -0 を 0 にそろえる（倍率1で負の向きへずらそうとしたとき、Math.max(-0, ...) が -0 になる）
  const clamp = (value: number, limit: number) =>
    Number.isFinite(value) ? Math.min(limit, Math.max(-limit, value)) + 0 : 0;
  return { pan: { x: clamp(view.pan.x, maxX), y: clamp(view.pan.y, maxY) }, zoom };
}

/**
 * 指で変えた見え方を、正射影の範囲にする。
 * @param base - 範囲全体が収まる見え方
 * @param view - 指で変えた見え方（`clampEditView` で収めたもの）
 * @returns 正射影の範囲
 */
export function applyEditView(base: OrthoBounds, view: EditViewState): OrthoBounds {
  const halfWidth = (base.right - base.left) / 2 / view.zoom;
  const halfHeight = (base.top - base.bottom) / 2 / view.zoom;
  const centerX = (base.left + base.right) / 2 + view.pan.x;
  const centerY = (base.top + base.bottom) / 2 + view.pan.y;
  return { bottom: centerY - halfHeight, left: centerX - halfWidth, right: centerX + halfWidth, top: centerY + halfHeight };
}

/**
 * 画面の1点（2本指のまん中）を動かさないように、倍率を変える。
 *
 * 画面のまん中を基準に拡大すると、拡大したい所が指の間から逃げていく。
 * 指の間にある物が、拡大したあとも指の間に残るようにする。
 * @param base - 範囲全体が収まる見え方
 * @param view - 今の見え方
 * @param zoom - 新しい倍率（範囲の外なら収める）
 * @param focus - 動かさない点。画面の左上を(0, 0)、右下を(1, 1)とした位置
 * @returns 新しい見え方
 */
export function zoomEditViewAt(
  base: OrthoBounds,
  view: EditViewState,
  zoom: number,
  focus: { u: number; v: number },
): EditViewState {
  const before = applyEditView(base, view);
  // 動かさない点の、カメラから見た座標
  const focusX = before.left + (before.right - before.left) * focus.u;
  const focusY = before.top - (before.top - before.bottom) * focus.v;
  const nextZoom = clampEditView(base, { pan: view.pan, zoom }).zoom;
  const width = (base.right - base.left) / nextZoom;
  const height = (base.top - base.bottom) / nextZoom;
  // 新しい見え方でも focus の位置に focusX / focusY が来るよう、中心を決める
  const centerX = focusX - width * focus.u + width / 2;
  const centerY = focusY + height * focus.v - height / 2;
  return clampEditView(base, {
    pan: { x: centerX - (base.left + base.right) / 2, y: centerY - (base.top + base.bottom) / 2 },
    zoom: nextZoom,
  });
}

/**
 * 指でなぞった分だけ、見え方を動かす。床が指についてくるように、指と逆向きへカメラを動かす。
 * @param base - 範囲全体が収まる見え方
 * @param view - 今の見え方
 * @param delta - 指が動いた量（CSSピクセル。右・下が正）
 * @param screen - 画面の大きさ（CSSピクセル）
 * @returns 新しい見え方
 */
export function panEditView(
  base: OrthoBounds,
  view: EditViewState,
  delta: { x: number; y: number },
  screen: { height: number; width: number },
): EditViewState {
  const unitsPerPixelX = (base.right - base.left) / view.zoom / Math.max(1, screen.width);
  const unitsPerPixelY = (base.top - base.bottom) / view.zoom / Math.max(1, screen.height);
  return clampEditView(base, {
    // 指を右へ動かしたら床も右へ動く ＝ カメラは左へ。指を下へ動かしたら、カメラは上へ
    pan: { x: view.pan.x - delta.x * unitsPerPixelX, y: view.pan.y + delta.y * unitsPerPixelY },
    zoom: view.zoom,
  });
}

/**
 * カメラから見た点がすべて、画面のうちUIに隠れていない部分に収まるよう、正射影の範囲を決める。
 *
 * 縦横の縮尺は同じにする（違うと部屋がつぶれて見える）。画面の上下はUIが隠しているので、
 * 点はその間（`insets` を除いた高さ）の真ん中に来るよう、範囲を上下にずらす。
 * @param points - カメラから見た座標（x: 右、y: 上）
 * @param screen - 画面の大きさ（CSSピクセル）
 * @param insets - 上下でUIが隠している高さ（CSSピクセル）
 * @returns 正射影の範囲
 */
export function fitOrthoToPoints(
  points: readonly { x: number; y: number }[],
  screen: { height: number; width: number },
  insets: EditInsets,
): OrthoBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(1, screen.width);
  const height = Math.max(1, screen.height);
  // 隠れていない高さ。UIが画面のほとんどを覆うような値が来ても、0や負にしない
  const visibleHeight = Math.max(height * 0.2, height - Math.max(0, insets.top) - Math.max(0, insets.bottom));
  const contentWidth = (maxX - minX) * (1 + FIT_MARGIN * 2);
  const contentHeight = (maxY - minY) * (1 + FIT_MARGIN * 2);
  // 1ピクセルあたりの長さ。幅と高さのうち、きついほうに合わせる
  const unitsPerPixel = Math.max(contentWidth / width, contentHeight / visibleHeight, 1e-6);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfWidth = (width * unitsPerPixel) / 2;
  // 隠れていない部分の真ん中が centerY に来るよう、画面の上端の値を決める
  const top = centerY + (visibleHeight * unitsPerPixel) / 2 + Math.max(0, insets.top) * unitsPerPixel;
  return {
    bottom: top - height * unitsPerPixel,
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top,
  };
}
