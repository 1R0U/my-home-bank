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

import type { MapObject, MapRouteId, Season } from "../../types/map";

/** プレイヤーの向き。 */
export type Direction = "down" | "left" | "right" | "up";

/** RN → WebView。RN 側が WebView に送る意図。 */
export type RpgHubIntent =
  /** マップデータと季節を反映する。 */
  | { objects: MapObject[]; season: Season; type: "setMap" }
  /** 仮想パッドの入力。変化したときだけ送る。停止は direction: null。 */
  | { direction: Direction | null; type: "setInput"; x: number; z: number }
  /** 画面遷移中など、WebView 側の入力受付を止める。 */
  | { enabled: boolean; type: "setInputEnabled" };

/** WebView → RN。WebView 側が RN に返すイベント。 */
export type RpgHubEvent =
  /** シーンの準備完了。 */
  | { event: "ready" }
  /** 位置スナップショット。UI・保存用で、フレーム内判定には使わない。 */
  | { direction: Direction; event: "position"; x: number; z: number }
  /** 接近対象の変化。範囲内に何も無いときは null。 */
  | { event: "nearby"; id: string | null }
  /** 建物のタップ。RN 側で許可済みルート辞書を引いてから遷移する。 */
  | { event: "navigate"; route: MapRouteId }
  /** WebView 側で発生した例外。 */
  | { event: "error"; message: string };

type IntentParseResult =
  | { intent: RpgHubIntent; success: true }
  | { errors: string[]; success: false };

type EventParseResult =
  | { event: RpgHubEvent; success: true }
  | { errors: string[]; success: false };

const DIRECTIONS: readonly Direction[] = ["down", "left", "right", "up"];
const SEASONS: readonly Season[] = ["autumn", "spring", "summer", "winter"];
const ROUTE_IDS: readonly MapRouteId[] = ["bank", "history", "store-child", "tasks-child"];

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
 * マップ反映の意図を組み立てる。
 * @param objects - マップオブジェクト一覧
 * @param season - 現在の季節
 * @returns setMap 意図
 */
export function createSetMapIntent(objects: MapObject[], season: Season): RpgHubIntent {
  return { objects, season, type: "setMap" };
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
 * 入力受付の切り替え意図を組み立てる。
 * @param enabled - 受け付ける場合は true
 * @returns setInputEnabled 意図
 */
export function createSetInputEnabledIntent(enabled: boolean): RpgHubIntent {
  return { enabled, type: "setInputEnabled" };
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

  if (value.type === "setInput") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
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

  if (value.type === "setInputEnabled") {
    if (typeof value.enabled !== "boolean") {
      return { errors: ["enabledが真偽値ではありません"], success: false };
    }
    return { intent: { enabled: value.enabled, type: "setInputEnabled" }, success: true };
  }

  return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
}

/**
 * WebView から RN へ返すイベントをパースし、型と内容を検証する。
 * 未知の event や不正な値は破棄する。
 *
 * navigate の route は許可済みの MapRouteId のみ通す。ここを通過した値だけを
 * RN 側でルート辞書に引かせることで、WebView 側のデータ由来で任意の画面へ
 * 遷移できないようにする。
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

  if (value.event === "position") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
      return { errors: ["x/zが有限数値ではありません"], success: false };
    }
    if (!isOneOf(value.direction, DIRECTIONS)) {
      return { errors: [`directionが不正です: ${String(value.direction)}`], success: false };
    }
    return {
      event: { direction: value.direction, event: "position", x: value.x, z: value.z },
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

  if (value.event === "navigate") {
    if (!isOneOf(value.route, ROUTE_IDS)) {
      return { errors: [`routeが不正です: ${String(value.route)}`], success: false };
    }
    return { event: { event: "navigate", route: value.route }, success: true };
  }

  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }

  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
