// 自分の家の中（Issue #386）の RN ⇄ WebView ブリッジ。
//
// 3Dの部屋を描いてキャラクターを歩かせるのは WebView 側（webview/rpg-hub/houseRoom.ts）、
// 家具の機能（きがえ・階段・外へ）を実行するのは RN 側（components/MyHouseScreen.tsx）。
//
// 流れ:
//   1. WebView が ready を送る
//   2. RN が setLook（キャラクターの見た目）と setFloor（どの階を、どこに立って始めるか）を送る
//   3. スティックを動かすと、RN が move（左右の倒し具合）を送り、WebView がキャラクターを歩かせる
//   4. 使える家具に近づいた・離れたとき、WebView が nearby を送る。RN がボタンを出し、押されたら機能を実行する
//   5. WebView は階を作るたびに、名札を出す位置（画面上の座標）を tags で送る
//
// 我が家タウンのブリッジ（bridge.ts）と同じく、受け取った値は必ず検証する。
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数のみ。

import { HOUSE_FLOORS, type HouseFloor } from "./houseRoom.ts";
import { parseCharacterLook, type PortraitLook } from "./portraitBridge.ts";

/** RN → WebView。 */
export type HouseRoomIntent =
  /** キャラクターの見た目。変わるたびに送る */
  | { look: PortraitLook; type: "setLook" }
  /** 映す階と、キャラクターが立つ位置（部屋の横幅に対する割合） */
  | { floor: HouseFloor; standX: number; type: "setFloor" }
  /** スティックの左右の倒し具合（-1 で左いっぱい、1 で右いっぱい、0 で離した） */
  | { dx: number; type: "move" }
  /** うろうろ歩くかどうか。別の画面へ行っている間は止める */
  | { active: boolean; type: "setActive" };

/** 名札を出す位置。WebView の左上を原点とした、画面上の座標（React Native の長さの単位と同じ） */
export type HouseRoomTag = { id: string; x: number; y: number };

/** WebView → RN。 */
export type HouseRoomEvent =
  /** 描く準備ができた。これを受け取ってから setLook / setFloor を送る */
  | { event: "ready" }
  /** 使える家具に近づいた（furnitureId）・離れた（null）。RN がボタンを出し分ける */
  | { event: "nearby"; floor: HouseFloor; furnitureId: string | null }
  /** キャラクターがタップされた */
  | { event: "characterTapped" }
  /** 名札を出す位置 */
  | { event: "tags"; floor: HouseFloor; tags: HouseRoomTag[] }
  /** WebView 側で発生した例外 */
  | { event: "error"; message: string };

type IntentParseResult = { intent: HouseRoomIntent; success: true } | { errors: string[]; success: false };
type EventParseResult = { event: HouseRoomEvent; success: true } | { errors: string[]; success: false };

/** 受け取る名札の数の上限。部屋の家具の数を十分に上回る値。壊れた値で大量に描かないため */
const MAX_TAGS = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHouseFloor(value: unknown): value is HouseFloor {
  return typeof value === "string" && (HOUSE_FLOORS as readonly string[]).includes(value);
}

/**
 * 文字列なら JSON として読む。
 * @param raw - 受け取った値
 * @returns 読んだ値。JSON として読めなければ undefined
 */
function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * 意図・イベントを postMessage で送るための文字列にする。
 * @param message - 送る意図またはイベント
 * @returns JSON 文字列
 */
export function encodeHouseRoomMessage(message: HouseRoomIntent | HouseRoomEvent): string {
  return JSON.stringify(message);
}

/**
 * WebView 側で受け取った意図を検証する。
 * @param raw - message イベントで受け取った値
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parseHouseRoomIntent(raw: unknown): IntentParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.type === "setLook") {
    const look = parseCharacterLook(value.look);
    if ("errors" in look) return { errors: look.errors, success: false };
    return { intent: { look: look.look, type: "setLook" }, success: true };
  }
  if (value.type === "setFloor") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (!isFiniteNumber(value.standX) || value.standX < 0 || value.standX > 1) {
      return { errors: ["standXは0〜1の数で指定してください"], success: false };
    }
    return { intent: { floor: value.floor, standX: value.standX, type: "setFloor" }, success: true };
  }
  if (value.type === "move") {
    if (!isFiniteNumber(value.dx) || value.dx < -1 || value.dx > 1) {
      return { errors: ["dxは-1〜1の数で指定してください"], success: false };
    }
    return { intent: { dx: value.dx, type: "move" }, success: true };
  }
  if (value.type === "setActive") {
    if (typeof value.active !== "boolean") return { errors: ["activeは真偽値で指定してください"], success: false };
    return { intent: { active: value.active, type: "setActive" }, success: true };
  }
  return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
}

/**
 * RN 側で受け取ったイベントを検証する。
 * @param raw - onMessage で受け取った値
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parseHouseRoomEvent(raw: unknown): EventParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") return { event: { event: "ready" }, success: true };
  if (value.event === "characterTapped") return { event: { event: "characterTapped" }, success: true };
  if (value.event === "nearby") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    // 離れたときは null が届く
    const furnitureId =
      value.furnitureId === null ? null : isNonEmptyString(value.furnitureId) ? value.furnitureId : undefined;
    if (furnitureId === undefined) return { errors: ["furnitureIdが不正です"], success: false };
    return { event: { event: "nearby", floor: value.floor, furnitureId }, success: true };
  }
  if (value.event === "tags") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (!Array.isArray(value.tags) || value.tags.length > MAX_TAGS) {
      return { errors: ["tagsが不正です"], success: false };
    }
    const tags: HouseRoomTag[] = [];
    for (const tag of value.tags) {
      if (!isRecord(tag) || !isNonEmptyString(tag.id) || !isFiniteNumber(tag.x) || !isFiniteNumber(tag.y)) {
        return { errors: ["tagsの中身が不正です"], success: false };
      }
      tags.push({ id: tag.id, x: tag.x, y: tag.y });
    }
    return { event: { event: "tags", floor: value.floor, tags }, success: true };
  }
  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }
  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
