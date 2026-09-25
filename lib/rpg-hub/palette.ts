// キャラクターの色の差し替え（palette）を扱う純粋関数。
//
// 住人（NPC）はマップデータの `palette`、プレイヤーは RN から届く `setPlayerPalette`
// 意図で色を受け取る。**どちらも同じ関数で色を決める**ことで、プレイヤー専用の作りに
// しない（家族NPCにも同じ見た目のデータを使う／Issue #254 / #255）。

import type { PaletteSlot } from "../../types/map";
import type { BuildingPart } from "./buildingParts";

/** 枠ごとの色の差し替え指定。指定がない枠はパーツ側の色をそのまま使う。 */
export type Palette = Partial<Record<PaletteSlot, string>>;

/** 色を差し替えられる枠の一覧。 */
export const PALETTE_SLOTS: readonly PaletteSlot[] = ["accent", "hair", "skin"];

/** 16進カラーコード（#rrggbb）。 */
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 色の差し替え指定を検証する（厳格）。
 * 未知の枠や、16進カラーコード以外の値が1つでもあれば全体を受け付けない。
 * マップデータの検証（`parseMapObject`）で使う。
 * @param value - 検証する値
 * @returns 有効な場合は差し替え指定、そうでない場合は null
 */
export function parsePalette(value: unknown): Palette | null {
  if (!isRecord(value)) return null;

  // WebView 用のバンドルにも入るため、分割代入（`const [slot, color]`）を使わない。
  // esbuild のターゲット（es2017 / ios13 / chrome80）で変換できず、build:scene が落ちる。
  const palette: Palette = {};
  for (const slot of Object.keys(value)) {
    const color = value[slot];
    if (!(PALETTE_SLOTS as readonly string[]).includes(slot)) return null;
    if (typeof color !== "string" || !COLOR_PATTERN.test(color)) return null;
    palette[slot as PaletteSlot] = color;
  }
  return palette;
}

/**
 * 色の差し替え指定から、使える枠だけを取り出す（寛容）。
 *
 * 見た目だけの情報なので、1枠が不正でも残りの枠は反映する。全体を捨てると、
 * 1か所の不正で全身が既定色に戻ってしまう（`setPlayerEquipment` と同じ考え方）。
 * @param value - 取り出す元の値
 * @returns 有効な枠だけを持つ差し替え指定。オブジェクトでなければ null
 */
export function pickValidPalette(value: unknown): Palette | null {
  if (!isRecord(value)) return null;

  const palette: Palette = {};
  for (const slot of PALETTE_SLOTS) {
    const color = value[slot];
    if (typeof color === "string" && COLOR_PATTERN.test(color)) palette[slot] = color;
  }
  return palette;
}

/**
 * パーツ1つを実際に何色で描くかを決める。
 * パーツに差し替え枠があり、差し替え指定に同じ枠の色があればそちらを使う。
 * @param part - パーツ定義
 * @param palette - 差し替え指定。無ければパーツの色のまま
 * @returns 描く色（#rrggbb）
 */
export function resolvePartColor(part: BuildingPart, palette: Palette | undefined): string {
  return (part.paletteSlot && palette?.[part.paletteSlot]) || part.color;
}
