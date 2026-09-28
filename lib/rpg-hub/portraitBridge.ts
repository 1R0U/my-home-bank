// キャラクターの肖像（Issue #306）の RN ⇄ WebView ブリッジ。
//
// ホーム画面・設定画面のアイコンに、我が家タウンと同じ姿のキャラクターを出すため、
// 見えない WebView でキャラクターだけを描いて画像（PNG の data URL）を受け取る。
// 描く側は webview/rpg-hub/portrait.ts。
//
// 我が家タウンのブリッジ（bridge.ts）とは送るものがまったく違うので、型を分けてある。
// 考え方（粗い JSON だけをやり取りし、受け取った値は必ず検証する）は同じ。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数のみ。

import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import type { Season } from "../../types/map";
import { pickValidEquipment } from "./bridge.ts";
import { isCharacterType, type CharacterType } from "./characterTypes.ts";
import type { EquipmentMap } from "./equipment.ts";
import { PALETTE_SLOTS, pickValidPalette, type Palette } from "./palette.ts";

/**
 * 肖像に描くキャラクターの見た目。我が家タウンでプレイヤーに反映しているものと同じ3つに、
 * 照明を決める季節を足したもの。
 */
export type PortraitLook = {
  characterType: CharacterType;
  equipment: EquipmentMap;
  palette: Palette;
  /** 照明の色と強さは季節で変わる（seasonalLook.ts）。町と同じ明るさで描くため */
  season: Season;
};

/** RN → WebView。 */
export type PortraitIntent = {
  /** 返ってきた画像がどの依頼の結果かを見分けるための値 */
  key: string;
  look: PortraitLook;
  type: "renderPortrait";
};

/** WebView → RN。 */
export type PortraitEvent =
  /** 描く準備ができた。これを受け取ってから renderPortrait を送る */
  | { event: "ready" }
  /** 描き終わった画像 */
  | { dataUrl: string; event: "portrait"; key: string }
  /** WebView 側で発生した例外 */
  | { event: "error"; message: string };

type IntentParseResult =
  | { intent: PortraitIntent; success: true }
  | { errors: string[]; success: false };

type EventParseResult =
  | { event: PortraitEvent; success: true }
  | { errors: string[]; success: false };

/** 受け取る画像の形式。PNG 以外は受け取らない。 */
const PORTRAIT_DATA_URL_PREFIX = "data:image/png;base64,";

/**
 * 受け取る画像の大きさの上限（文字数）。
 * 256px四方のPNGは大きくても数百KBなので、それを十分に上回る値にしてある。
 * 上限を置くのは、壊れた値や想定外の巨大な値をそのまま画面へ渡さないため。
 */
export const MAX_PORTRAIT_DATA_URL_LENGTH = 2 * 1024 * 1024;

const SEASONS: readonly Season[] = ["autumn", "spring", "summer", "winter"];

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 空でない文字列かどうかを判定する。
 * @param value - 判定する値
 * @returns 空でない文字列の場合は true
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * 見た目から、肖像を見分けるためのキーを作る。
 *
 * **同じ見た目なら必ず同じキー、1か所でも違えば違うキーになる。** 描いた画像の
 * 使い回し（キャッシュ）と、返ってきた画像が今の見た目のものかの確認に使う。
 * 枠は決まった順に並べるので、オブジェクトのキーの順番には左右されない。
 * @param look - キャラクターの見た目
 * @returns 見た目を表すキー
 */
export function getPortraitKey(look: PortraitLook): string {
  const equipment = EQUIPMENT_SLOTS.map((slot) => `${slot}=${look.equipment[slot] ?? ""}`).join(",");
  const palette = PALETTE_SLOTS.map((slot) => `${slot}=${look.palette[slot] ?? ""}`).join(",");
  return [look.characterType, look.season, equipment, palette].join("|");
}

/**
 * 肖像を描く依頼を組み立てる。
 * @param look - 描くキャラクターの見た目
 * @returns renderPortrait 意図
 */
export function createRenderPortraitIntent(look: PortraitLook): PortraitIntent {
  return { key: getPortraitKey(look), look, type: "renderPortrait" };
}

/**
 * 意図・イベントを postMessage で送るための文字列にする。
 * @param message - 送る意図またはイベント
 * @returns JSON 文字列
 */
export function encodePortraitMessage(message: PortraitIntent | PortraitEvent): string {
  return JSON.stringify(message);
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
 * WebView 側で受け取った依頼を検証する。
 *
 * 装備と色は我が家タウンと同じく、**不正な枠だけを落として通す**。1枠の不正で
 * 肖像そのものが出ないより、その枠を除いた姿で出るほうがよいため。
 * 種類と季節は形と照明そのものを決めるので、不正なら依頼ごと捨てる。
 * @param raw - message イベントで受け取った値
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parsePortraitIntent(raw: unknown): IntentParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };
  if (value.type !== "renderPortrait") {
    return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
  }
  if (!isNonEmptyString(value.key)) return { errors: ["keyが不正です"], success: false };
  if (!isRecord(value.look)) return { errors: ["lookがオブジェクト形式ではありません"], success: false };

  // 分割代入は WebView 側のバンドルで変換できないため使わない（AGENTS.md「PR前チェック」）
  const characterType = value.look.characterType;
  const season = value.look.season;
  if (!isCharacterType(characterType)) {
    return { errors: [`characterTypeが不正です: ${String(characterType)}`], success: false };
  }
  if (typeof season !== "string" || !(SEASONS as readonly string[]).includes(season)) {
    return { errors: [`seasonが不正です: ${String(season)}`], success: false };
  }
  const equipment = pickValidEquipment(value.look.equipment);
  if (equipment === null) {
    return { errors: ["equipmentがオブジェクト形式ではありません"], success: false };
  }
  const palette = pickValidPalette(value.look.palette);
  if (palette === null) {
    return { errors: ["paletteがオブジェクト形式ではありません"], success: false };
  }

  return {
    intent: {
      key: value.key,
      look: { characterType, equipment, palette, season: season as Season },
      type: "renderPortrait",
    },
    success: true,
  };
}

/**
 * RN 側で受け取ったイベントを検証する。
 *
 * 画像は PNG の data URL で、上限の大きさに収まるものだけを通す。
 * そのまま `<Image>` に渡すため、ほかの形式（URL など）を読み込ませないようにする。
 * @param raw - onMessage で受け取った値
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parsePortraitEvent(raw: unknown): EventParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") return { event: { event: "ready" }, success: true };

  if (value.event === "portrait") {
    if (!isNonEmptyString(value.key)) return { errors: ["keyが不正です"], success: false };
    const dataUrl = value.dataUrl;
    if (
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith(PORTRAIT_DATA_URL_PREFIX) ||
      dataUrl.length <= PORTRAIT_DATA_URL_PREFIX.length
    ) {
      return { errors: ["dataUrlがPNGのdata URLではありません"], success: false };
    }
    if (dataUrl.length > MAX_PORTRAIT_DATA_URL_LENGTH) {
      return { errors: ["dataUrlが大きすぎます"], success: false };
    }
    return { event: { dataUrl, event: "portrait", key: value.key }, success: true };
  }

  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: { event: "error", message }, success: true };
  }

  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
