// RPGハブ（WebView + Babylon.js）の RN ⇄ WebView ブリッジ。
//
// 設計方針（docs/RPG_HUB_ARCHITECTURE.md 3.1 / 6章）:
//   やり取りするのは「意図(intent)」と「イベント(event)」だけの粗い JSON に限定し、
//   RN 側から WebView 内の Babylon ノードを直接操作しない。別 JS コンテキスト間で
//   オブジェクト参照を共有しない前提の設計にするため。
//
//   プレイヤー位置の正は WebView 側のゲームループが保持する。RN へは位置スナップショットを
//   間引いて送り、接近対象や遷移などの状態変化は変化したときだけ送る（毎フレーム送らない）。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数のみ。
// WebView 側（webview/rpg-hub/scene.ts）と RN 側（components/rpg-hub-web/）の両方から使う。

import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import type { MapObject, Season } from "../../types/map";
import { getWearableSlot } from "./catalog.ts";
import { resolveAssetId } from "./assets.ts";
import type { EditArea, EditInsets } from "./editView.ts";
import type { EquipmentMap } from "./equipment.ts";
import { pickValidPalette, type Palette } from "./palette.ts";
import type { PerfStats } from "./perfStats.ts";

/** 一覧から引っぱっている指の段階。動かしている・離した・取りやめた。 */
export type EditDragPhase = "cancel" | "end" | "move";

/**
 * プレイヤーの向き。
 *
 * **画面上の向き（スティックを倒した向き）であり、町の X・Z 軸の向きではない（#379）。**
 * カメラは斜め45度から見ているため、町の向きとして使うと45度ずれる。町での向きが
 * 必要なときは、移動量（x, z）か `facingY` を使う。
 */
export type Direction = "down" | "left" | "right" | "up";

/** RN → WebView。RN 側が WebView に送る意図。 */
export type RpgHubIntent =
  /** マップデータと季節を反映する。 */
  | { objects: MapObject[]; season: Season; type: "setMap" }
  /**
   * 季節だけを差し替える（Issue #282）。
   * setMap と分けてあるのは、季節が変わっただけで建物や木を作り直さないため
   * （作り直すと住人の立ち位置も初期化される）。色と照明、地面の飾りだけが変わる。
   */
  | { season: Season; type: "setSeason" }
  /** 仮想パッドの入力。変化したときだけ送る。停止は direction: null。 */
  | { direction: Direction | null; type: "setInput"; x: number; z: number }
  /** 画面遷移中など、WebView 側の入力受付を止める。 */
  | { enabled: boolean; type: "setInputEnabled" }
  /** プレイヤーを指定の位置・向きへ置き直す（建物から出てきたときなど）。 */
  | { facingY: number; requestId?: string; type: "placePlayer"; x: number; z: number }
  /** プレイヤーが身に着けているものを差し替える（Issue #222）。 */
  | { equipment: EquipmentMap; type: "setPlayerEquipment" }
  /**
   * プレイヤーの色を差し替える（Issue #254）。空なら既定の色に戻す。
   * 装備とは変わるタイミングが違うので、意図を分けてある。
   */
  | { palette: Palette; type: "setPlayerPalette" }
  /**
   * かざるの編集モード（Issue #477）を始める・やめる。`area` が null ならやめる。
   * 編集モードの間、カメラは `area` 全体を見下ろし、床のマス目を出し、タップと長押しを
   * 装飾の操作として受け取る（建物へ入る・話しかけるには使わない）。
   * `insets` は画面の上下で RN のUIが隠している高さ（CSSピクセル）。その間に `area` を収める。
   */
  | { area: EditArea | null; insets: EditInsets; type: "setEditMode" }
  /** 編集モードで選んでいる装飾に目印を出す。null で消す。 */
  | { id: string | null; type: "setEditSelection" }
  /** 編集モードで、指で変えたズームと移動をやめ、範囲全体が収まる見え方へ戻す（「もとに もどす」） */
  | { type: "resetEditView" }
  /**
   * 編集モードで、下の一覧から装飾を引っぱっている指の位置（Issue #477）。
   * x / y は WebView の左上からのCSSピクセル。`move` の間は置き場所の目印を指の下のマスへ動かし、
   * `end` でそのマスを `editDrop` で返す。`cancel` は目印を消すだけ。
   */
  | { assetId: string; phase: EditDragPhase; type: "editDrag"; x: number; y: number }
  /**
   * 描画負荷の計測を始める・止める（Issue #200）。開発ビルドのときだけ RN が送る。
   * 始めると、シーンが一定間隔で perfStats イベントを返す。
   */
  | { enabled: boolean; type: "setPerfStats" };

/** WebView → RN。WebView 側が RN に返すイベント。 */
export type RpgHubEvent =
  /** シーンの準備完了。 */
  | { event: "ready" }
  /** 指定位置への復元完了。初期座標の通知と、復元後の座標を区別する。 */
  | { event: "playerPlaced"; requestId: string }
  /**
   * 位置スナップショット。UI・保存用で、フレーム内判定には使わない。
   *
   * `facingY` は見た目の向き（ラジアン、0が +Z）。`direction` は4方向に丸めた値なので、
   * 装飾を正面へ置くとき（#224）のように**細かい向きが要る用途では facingY を使う**。
   */
  | { direction: Direction; event: "position"; facingY: number; x: number; z: number }
  /** 接近対象の変化。範囲内に何も無いときは null。 */
  | { event: "nearby"; id: string | null }
  /** NPCのタップ。RN 側が id からマップデータを引いて会話を出す。 */
  | { event: "talk"; id: string }
  /**
   * 編集モードでのタップ（Issue #477）。置いた装飾をタップしたらその id、何も無い所なら null。
   * RN 側が選択状態を決める。
   */
  | { event: "editTap"; id: string | null }
  /** 編集モードで、置いた装飾を長押しして持ち上げた（Issue #477）。音を鳴らす・選択を外すのに使う。 */
  | { event: "editLift"; id: string }
  /**
   * 編集モードで、装飾をマスへ下ろした（Issue #477）。x / z はマスにそろえた中心の座標。
   * `id` が null なら下の一覧から引っぱってきた新しい装飾、そうでなければ動かした装飾。
   * **置けるかの最終判断と保存は RN 側が行う**（行けなくなる建物が無いかの確認が重いため）。
   */
  | { assetId: string; event: "editDrop"; id: string | null; x: number; z: number }
  /** WebView 側で発生した例外。 */
  | { event: "error"; message: string }
  /** 描画負荷の計測値（Issue #200）。setPerfStats で計測を始めたときだけ届く。 */
  | ({ event: "perfStats" } & PerfStats);

type IntentParseResult =
  | { intent: RpgHubIntent; success: true }
  | { errors: string[]; success: false };

type EventParseResult =
  | { event: RpgHubEvent; success: true }
  | { errors: string[]; success: false };

/**
 * 1回の setInput で許容する移動量の上限（ワールド座標）。
 *
 * RN 側の仮想パッドが送る最大値は 0.18（MAX_STEP）なので十分な余裕がある。
 * 上限を設けない場合、巨大な有限値を受け取ると `moveWithinMap` の分割ステップ数が
 * 発散してゲームループが実質停止するため、ブリッジの時点で弾く。
 */
export const MAX_INPUT_STEP = 1;

const DIRECTIONS: readonly Direction[] = ["down", "left", "right", "up"];
const SEASONS: readonly Season[] = ["autumn", "spring", "summer", "winter"];
const EDIT_DRAG_PHASES: readonly EditDragPhase[] = ["cancel", "end", "move"];

/**
 * 編集モードで映す範囲として受け取れる値か。町の広さ（`placed_decorations` の座標の範囲）を
 * 大きく超える値は、カメラが遠くへ飛ぶだけなので弾く。
 * @param value - 判定する値
 * @returns 範囲として使えれば true
 */
function isEditArea(value: unknown): value is EditArea {
  if (!isRecord(value)) return false;
  const numbers = [value.minX, value.maxX, value.minZ, value.maxZ, value.height];
  if (!numbers.every(isFiniteNumber)) return false;
  const area = value as EditArea;
  return (
    area.minX < area.maxX &&
    area.minZ < area.maxZ &&
    area.height >= 0 &&
    [area.minX, area.maxX, area.minZ, area.maxZ].every((n) => Math.abs(n) <= 200)
  );
}

/**
 * 空でない文字列か。
 * @param value - 判定する値
 * @returns 空白だけでない文字列なら true
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 有限数値かどうかを判定する。
 * @param value - 判定する値
 * @returns 有限数値の場合は true
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 文字列が許可リストに含まれるかを判定する。
 * @param value - 判定する値
 * @param allowed - 許可する値の一覧
 * @returns 含まれる場合は true
 */
function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/**
 * 受け取った装備の指定から、着けられるものだけを残す。
 *
 * 装備は見た目だけの情報なので、1つ着けられなくても表示は続けたい。
 * **その枠に着けられないもの（カタログに無い・枠が違う）だけを落とす。**
 * 我が家タウン（setPlayerEquipment）と肖像（Issue #306）の両方で使う。
 * @param raw - 受け取った値
 * @returns 着けられるものだけの装備。オブジェクトでなければ null
 */
export function pickValidEquipment(raw: unknown): EquipmentMap | null {
  if (!isRecord(raw)) return null;
  const equipment: EquipmentMap = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const assetId = resolveAssetId(raw[slot]);
    if (assetId !== null && getWearableSlot(assetId) === slot) {
      equipment[slot] = assetId;
    }
  }
  return equipment;
}

/**
 * マップ反映の意図を組み立てる。
 * @param objects - マップオブジェクト一覧
 * @param season - 現在の季節
 * @returns setMap 意図
 */
export function createSetMapIntent(objects: MapObject[], season: Season): RpgHubIntent {
  return { objects, season, type: "setMap" };
}

/**
 * 季節の差し替えの意図を組み立てる。
 * @param season - 現在の季節
 * @returns setSeason 意図
 */
export function createSetSeasonIntent(season: Season): RpgHubIntent {
  return { season, type: "setSeason" };
}

/**
 * 仮想パッド入力の意図を組み立てる。
 * @param x - X方向の移動量
 * @param z - Z方向の移動量
 * @param direction - 向き。停止時は null
 * @returns setInput 意図
 */
export function createSetInputIntent(
  x: number,
  z: number,
  direction: Direction | null,
): RpgHubIntent {
  return { direction, type: "setInput", x, z };
}

/**
 * 描画負荷の計測の切り替え意図を組み立てる（Issue #200）。
 * @param enabled - 計測する場合は true
 * @returns setPerfStats 意図
 */
export function createSetPerfStatsIntent(enabled: boolean): RpgHubIntent {
  return { enabled, type: "setPerfStats" };
}

/**
 * 入力受付の切り替え意図を組み立てる。
 * @param enabled - 受け付ける場合は true
 * @returns setInputEnabled 意図
 */
export function createSetInputEnabledIntent(enabled: boolean): RpgHubIntent {
  return { enabled, type: "setInputEnabled" };
}

/**
 * プレイヤーの置き直しの意図を組み立てる。
 * @param x - X座標
 * @param z - Z座標
 * @param facingY - 向き（ラジアン、0が +Z）
 * @param requestId - 配置完了の通知が必要なときの識別子
 * @returns placePlayer 意図
 */
export function createPlacePlayerIntent(x: number, z: number, facingY: number, requestId?: string): RpgHubIntent {
  return { facingY, type: "placePlayer", x, z, ...(requestId === undefined ? {} : { requestId }) };
}

/**
 * プレイヤーの装備を差し替える意図を組み立てる。
 * @param equipment - 身に着けているもの
 * @returns setPlayerEquipment 意図
 */
export function createSetPlayerEquipmentIntent(equipment: EquipmentMap): RpgHubIntent {
  return { equipment, type: "setPlayerEquipment" };
}

/**
 * プレイヤーの色を差し替える意図を組み立てる。
 * @param palette - 枠ごとの色。指定の無い枠は既定の色になる
 * @returns setPlayerPalette 意図
 */
export function createSetPlayerPaletteIntent(palette: Palette): RpgHubIntent {
  return { palette, type: "setPlayerPalette" };
}

/**
 * 編集モードを始める・やめる意図を組み立てる（Issue #477）。
 * @param area - 映す範囲。null ならやめる
 * @param insets - 画面の上下で RN のUIが隠している高さ（CSSピクセル）
 * @returns setEditMode 意図
 */
export function createSetEditModeIntent(area: EditArea | null, insets: EditInsets): RpgHubIntent {
  return { area, insets, type: "setEditMode" };
}

/**
 * 編集モードで選んでいる装飾を伝える意図を組み立てる（Issue #477）。
 * @param id - 選んでいる装飾のid。null なら選んでいない
 * @returns setEditSelection 意図
 */
export function createSetEditSelectionIntent(id: string | null): RpgHubIntent {
  return { id, type: "setEditSelection" };
}

/**
 * 編集モードの見え方を、範囲全体が収まる見え方へ戻す意図を組み立てる（Issue #477）。
 * @returns resetEditView 意図
 */
export function createResetEditViewIntent(): RpgHubIntent {
  return { type: "resetEditView" };
}

/**
 * 下の一覧から引っぱっている指の位置を伝える意図を組み立てる（Issue #477）。
 * @param assetId - 引っぱっている装飾
 * @param phase - 動かしている・離した・取りやめた
 * @param x - WebView の左端からのCSSピクセル
 * @param y - WebView の上端からのCSSピクセル
 * @returns editDrag 意図
 */
export function createEditDragIntent(assetId: string, phase: EditDragPhase, x: number, y: number): RpgHubIntent {
  return { assetId, phase, type: "editDrag", x, y };
}

/**
 * 意図を WebView へ送るための文字列にシリアライズする。
 * @param intent - 送信する意図
 * @returns postMessage に渡す JSON 文字列
 */
export function encodeIntent(intent: RpgHubIntent): string {
  return JSON.stringify(intent);
}

/**
 * イベントを RN へ送るための文字列にシリアライズする。
 * @param event - 送信するイベント
 * @returns postMessage に渡す JSON 文字列
 */
export function encodeEvent(event: RpgHubEvent): string {
  return JSON.stringify(event);
}

/**
 * WebView 側で受け取った意図文字列をパースし、型と内容を検証する。
 * 未知の type や不正な値は破棄する。
 *
 * setMap の objects は、送信元が RN 側で `parseMapObjects` による検証を通した値である
 * 前提で、ここでは形だけを確認する（配列であること）。
 * @param raw - message イベントで受け取った値
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parseIntent(raw: unknown): IntentParseResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { errors: ["JSONとして解釈できません"], success: false };
    }
  }
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.type === "setMap") {
    if (!Array.isArray(value.objects)) {
      return { errors: ["objectsが配列ではありません"], success: false };
    }
    if (!isOneOf(value.season, SEASONS)) {
      return { errors: [`seasonが不正です: ${String(value.season)}`], success: false };
    }
    return {
      intent: { objects: value.objects as MapObject[], season: value.season, type: "setMap" },
      success: true,
    };
  }

  if (value.type === "setSeason") {
    if (!isOneOf(value.season, SEASONS)) {
      return { errors: [`seasonが不正です: ${String(value.season)}`], success: false };
    }
    return { intent: { season: value.season, type: "setSeason" }, success: true };
  }

  if (value.type === "placePlayer") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
    }
    if (!isFiniteNumber(value.facingY)) {
      return { errors: ["facingYが有限数値ではありません"], success: false };
    }
    if (value.requestId !== undefined && !isNonEmptyString(value.requestId)) {
      return { errors: ["requestIdが不正です"], success: false };
    }
    return {
      intent: createPlacePlayerIntent(value.x, value.z, value.facingY, value.requestId as string | undefined),
      success: true,
    };
  }

  if (value.type === "setPlayerEquipment") {
    // 装備は見た目だけの情報なので、1つ着けられなくても遊べる。
    // 意図ごと捨てると裸になってしまうため、**着けられない枠だけを落として通す**。
    const equipment = pickValidEquipment(value.equipment);
    if (equipment === null) {
      return { errors: ["equipmentがオブジェクト形式ではありません"], success: false };
    }
    return { intent: { equipment, type: "setPlayerEquipment" }, success: true };
  }

  if (value.type === "setPlayerPalette") {
    // 装備と同じく見た目だけの情報なので、**不正な枠だけを落として通す**。
    // 意図ごと捨てると、1枠の不正で前の人の色が残ったままになる。
    const palette = pickValidPalette(value.palette);
    if (palette === null) {
      return { errors: ["paletteがオブジェクト形式ではありません"], success: false };
    }
    return { intent: { palette, type: "setPlayerPalette" }, success: true };
  }

  if (value.type === "setInput") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
    }
    if (Math.abs(value.x) > MAX_INPUT_STEP || Math.abs(value.z) > MAX_INPUT_STEP) {
      return {
        errors: [`x/zが許容範囲（±${MAX_INPUT_STEP}）を超えています`],
        success: false,
      };
    }
    const rawDirection = value.direction;
    let direction: Direction | null;
    if (rawDirection === null) {
      direction = null;
    } else if (isOneOf(rawDirection, DIRECTIONS)) {
      direction = rawDirection;
    } else {
      return { errors: [`directionが不正です: ${String(rawDirection)}`], success: false };
    }
    return {
      intent: { direction, type: "setInput", x: value.x, z: value.z },
      success: true,
    };
  }

  if (value.type === "setEditMode") {
    if (value.area !== null && !isEditArea(value.area)) {
      return { errors: ["areaが範囲でもnullでもありません"], success: false };
    }
    const insets = value.insets;
    if (!isRecord(insets) || !isFiniteNumber(insets.top) || !isFiniteNumber(insets.bottom)) {
      return { errors: ["insetsのtop/bottomが有限数値ではありません"], success: false };
    }
    return {
      intent: {
        area: value.area as EditArea | null,
        insets: { bottom: insets.bottom, top: insets.top },
        type: "setEditMode",
      },
      success: true,
    };
  }

  if (value.type === "setEditSelection") {
    if (value.id !== null && !isNonEmptyString(value.id)) {
      return { errors: ["idが文字列でもnullでもありません"], success: false };
    }
    return { intent: { id: value.id as string | null, type: "setEditSelection" }, success: true };
  }

  if (value.type === "resetEditView") {
    return { intent: { type: "resetEditView" }, success: true };
  }

  if (value.type === "editDrag") {
    if (!isNonEmptyString(value.assetId)) {
      return { errors: ["assetIdが文字列ではありません"], success: false };
    }
    if (!isOneOf(value.phase, EDIT_DRAG_PHASES)) {
      return { errors: [`phaseが不正です: ${String(value.phase)}`], success: false };
    }
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
      return { errors: ["x/yが有限数値ではありません"], success: false };
    }
    return {
      intent: { assetId: value.assetId, phase: value.phase, type: "editDrag", x: value.x, y: value.y },
      success: true,
    };
  }

  if (value.type === "setInputEnabled") {
    if (typeof value.enabled !== "boolean") {
      return { errors: ["enabledが真偽値ではありません"], success: false };
    }
    return { intent: { enabled: value.enabled, type: "setInputEnabled" }, success: true };
  }

  if (value.type === "setPerfStats") {
    if (typeof value.enabled !== "boolean") {
      return { errors: ["enabledが真偽値ではありません"], success: false };
    }
    return { intent: { enabled: value.enabled, type: "setPerfStats" }, success: true };
  }

  return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
}

/**
 * WebView から RN へ返すイベントをパースし、型と内容を検証する。
 * 未知の event や不正な値は破棄する。
 *
 * 建物への画面遷移は WebView からは起こさない（建物のタップは無い。Issue #491）。
 * 入る建物は RN 側が接近対象やマップの選択から決める。
 * @param raw - onMessage で受け取った値
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parseRpgHubEvent(raw: unknown): EventParseResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { errors: ["JSONとして解釈できません"], success: false };
    }
  }
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") {
    return { event: { event: "ready" }, success: true };
  }

  if (value.event === "playerPlaced") {
    if (!isNonEmptyString(value.requestId)) return { errors: ["requestIdが不正です"], success: false };
    return { event: { event: "playerPlaced", requestId: value.requestId }, success: true };
  }

  if (value.event === "position") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
    }
    if (!isFiniteNumber(value.facingY)) {
      return { errors: ["facingYが有限数値ではありません"], success: false };
    }
    if (!isOneOf(value.direction, DIRECTIONS)) {
      return { errors: [`directionが不正です: ${String(value.direction)}`], success: false };
    }
    return {
      event: {
        direction: value.direction,
        event: "position",
        facingY: value.facingY,
        x: value.x,
        z: value.z,
      },
      success: true,
    };
  }

  if (value.event === "nearby") {
    const rawId = value.id;
    let id: string | null;
    if (rawId === null) {
      id = null;
    } else if (typeof rawId === "string" && rawId.trim()) {
      id = rawId;
    } else {
      return { errors: ["idが不正です"], success: false };
    }
    return { event: { event: "nearby", id }, success: true };
  }

  if (value.event === "talk") {
    if (typeof value.id !== "string" || !value.id.trim()) {
      return { errors: ["idが不正です"], success: false };
    }
    return { event: { event: "talk", id: value.id }, success: true };
  }

  if (value.event === "editTap") {
    if (value.id !== null && !isNonEmptyString(value.id)) {
      return { errors: ["idが不正です"], success: false };
    }
    return { event: { event: "editTap", id: value.id as string | null }, success: true };
  }

  if (value.event === "editLift") {
    if (!isNonEmptyString(value.id)) return { errors: ["idが不正です"], success: false };
    return { event: { event: "editLift", id: value.id }, success: true };
  }

  if (value.event === "editDrop") {
    if (!isNonEmptyString(value.assetId)) return { errors: ["assetIdが不正です"], success: false };
    if (value.id !== null && !isNonEmptyString(value.id)) return { errors: ["idが不正です"], success: false };
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
    }
    return {
      event: { assetId: value.assetId, event: "editDrop", id: value.id as string | null, x: value.x, z: value.z },
      success: true,
    };
  }

  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }

  if (value.event === "perfStats") {
    const numbers = ["fps", "frameMsAvg", "frameMsP95", "drawCalls", "meshes", "instances", "activeMeshes", "objects"];
    const invalid = numbers.filter((key) => !isFiniteNumber(value[key]) || (value[key] as number) < 0);
    if (invalid.length > 0) {
      return { errors: [`数値でない計測値があります: ${invalid.join(", ")}`], success: false };
    }
    if (value.heapMb !== null && (!isFiniteNumber(value.heapMb) || value.heapMb < 0)) {
      return { errors: ["heapMbが数値でもnullでもありません"], success: false };
    }
    return {
      event: {
        activeMeshes: value.activeMeshes as number,
        drawCalls: value.drawCalls as number,
        event: "perfStats",
        fps: value.fps as number,
        frameMsAvg: value.frameMsAvg as number,
        frameMsP95: value.frameMsP95 as number,
        heapMb: value.heapMb as number | null,
        instances: value.instances as number,
        meshes: value.meshes as number,
        objects: value.objects as number,
      },
      success: true,
    };
  }

  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
