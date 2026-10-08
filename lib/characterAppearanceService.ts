import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { DEFAULT_CHARACTER_TYPE, isCharacterType, type CharacterType } from "./rpg-hub/characterTypes.ts";
import { isValidPaletteColor, type Palette, type PaletteChange } from "./rpg-hub/palette.ts";
import type { PaletteSlot } from "../types/map.ts";

/**
 * 選択する種類は `character_appearances`、種類別の色は `character_palettes` に保存する
 * （Issue #287 / #253 / #381）。
 *
 * 色は利用者とキャラクター種類の組み合わせごとに持ち、別の種類へ引き継がない。
 * 見た目の定義（形・パーツ・アンカー、色をどの部品へ当てるか）は
 * `lib/rpg-hub/catalog.ts` / `lib/rpg-hub/palette.ts` が持つ。
 */

/**
 * その利用者が選んでいるキャラクターの種類を取得する。
 * まだ選んだことが無い人（行が無い）は既定の種類を返す。
 * @param userId - 対象の利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 選んでいるキャラクターの種類
 */
export async function fetchCharacterType(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<CharacterType> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("character_appearances")
    .select("character_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return DEFAULT_CHARACTER_TYPE;

  const characterType = (data as { character_type: string }).character_type;
  return isCharacterType(characterType) ? characterType : DEFAULT_CHARACTER_TYPE;
}

/**
 * キャラクターの種類を保存する。
 *
 * `user_id` が主キーなので、初回選択も選び直しも upsert 1本で済む。
 * @param userId - 対象の利用者のid
 * @param characterType - 保存する種類
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function saveCharacterType(
  userId: string,
  characterType: CharacterType,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient
    .from("character_appearances")
    .upsert(
      { character_type: characterType, updated_at: new Date().toISOString(), user_id: userId },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

/** `Palette` の枠と、DBの列名の対応（Issue #253）。 */
const PALETTE_SLOT_COLUMNS: Record<PaletteSlot, "accent_color" | "hair_color" | "skin_color"> = {
  accent: "accent_color",
  hair: "hair_color",
  skin: "skin_color",
};

/**
 * 利用者がそのキャラクター種類で選んでいる色（3枠）を取得する。
 *
 * 選んだことが無い枠（列がNULL）や、候補に無い値（過去の候補が減った場合など）は
 * `Palette` に含めない。`resolvePartColor` は指定が無い枠をパーツ側の既定色で描くため、
 * 含めないことがそのまま「既定色にフォールバック」になる。
 * @param userId - 対象の利用者のid
 * @param characterType - 色を取得するキャラクター種類
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 選んでいる色。行が無ければ空
 */
export async function fetchCharacterPalette(
  userId: string,
  characterType: CharacterType,
  client?: Pick<SupabaseClient, "from">,
): Promise<Palette> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("character_palettes")
    .select("accent_color, hair_color, skin_color")
    .eq("user_id", userId)
    .eq("character_type", characterType)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return {};

  const row = data as { accent_color: string | null; hair_color: string | null; skin_color: string | null };
  const palette: Palette = {};
  if (isValidPaletteColor(row.accent_color)) palette.accent = row.accent_color;
  if (isValidPaletteColor(row.hair_color)) palette.hair = row.hair_color;
  if (isValidPaletteColor(row.skin_color)) palette.skin = row.skin_color;
  return palette;
}

/**
 * 色の変更をまとめて保存する（Issue #253 / #381）。
 *
 * `user_id` と `character_type` が主キーなので、初回選択も選び直しも upsert 1本で済む。変えた枠の列だけを
 * upsert のペイロードに含めるため、`ON CONFLICT` 時に触っていない枠を消してしまわない
 * （行が無い場合の新規作成では、他の枠は列のNULLのまま作られる）。
 * 「もとのいろ」（`color: null`）はその列をNULLに戻す。NULLの枠は差し替えなしとして
 * パーツ定義の色で描かれる（`fetchCharacterPalette` 参照）。
 * @param userId - 対象の利用者のid
 * @param characterType - 色を保存するキャラクター種類
 * @param changes - 変えた枠と色。空なら何もしない
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function savePaletteChanges(
  userId: string,
  characterType: CharacterType,
  changes: readonly PaletteChange[],
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  if (changes.length === 0) return;
  const payload: Record<string, string | null> = {
    character_type: characterType,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };
  for (const change of changes) {
    payload[PALETTE_SLOT_COLUMNS[change.slot]] = change.color;
  }

  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient
    .from("character_palettes")
    .upsert(payload, { onConflict: "user_id,character_type" });
  if (error) throw error;
}
