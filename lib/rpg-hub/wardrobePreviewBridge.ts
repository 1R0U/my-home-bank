// 更衣室のプレビュー（Issue #344）の RN ⇄ WebView ブリッジ。
//
// 更衣室で選んだ着せ替え品を、保存する前にキャラクターに着せて見せるため、
// 見た目を WebView へ送る。描く側は webview/rpg-hub/wardrobePreview.ts。
//
// 送る見た目は肖像（portraitBridge.ts）と同じ形で、検証も同じ関数（`parseCharacterLook`）を使う。
// 肖像は画像を返すが、プレビューは画面にそのまま映すだけなので、返すのは準備完了とエラーだけ。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数のみ。

import { parseCharacterLook, type PortraitLook } from "./portraitBridge.ts";

/** RN → WebView。 */
export type WardrobePreviewIntent = {
  look: PortraitLook;
  type: "setLook";
};

/** WebView → RN。 */
export type WardrobePreviewEvent =
  /** 描く準備ができた。これを受け取ってから setLook を送る */
  | { event: "ready" }
  /** WebView 側で発生した例外 */
  | { event: "error"; message: string };

type IntentParseResult =
  | { intent: WardrobePreviewIntent; success: true }
  | { errors: string[]; success: false };

type EventParseResult =
  | { event: WardrobePreviewEvent; success: true }
  | { errors: string[]; success: false };

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
 * プレビューに映す見た目を送る意図を組み立てる。
 * @param look - 映すキャラクターの見た目
 * @returns setLook 意図
 */
export function createSetPreviewLookIntent(look: PortraitLook): WardrobePreviewIntent {
  return { look, type: "setLook" };
}

/**
 * 意図・イベントを postMessage で送るための文字列にする。
 * @param message - 送る意図またはイベント
 * @returns JSON 文字列
 */
export function encodeWardrobePreviewMessage(
  message: WardrobePreviewIntent | WardrobePreviewEvent,
): string {
  return JSON.stringify(message);
}

/**
 * WebView 側で受け取った意図を検証する。
 * @param raw - message イベントで受け取った値
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parseWardrobePreviewIntent(raw: unknown): IntentParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };
  if (value.type !== "setLook") {
    return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
  }

  const look = parseCharacterLook(value.look);
  if ("errors" in look) return { errors: look.errors, success: false };

  return { intent: { look: look.look, type: "setLook" }, success: true };
}

/**
 * RN 側で受け取ったイベントを検証する。
 * @param raw - onMessage で受け取った値
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parseWardrobePreviewEvent(raw: unknown): EventParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") return { event: { event: "ready" }, success: true };

  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }

  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
