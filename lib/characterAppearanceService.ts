import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { DEFAULT_CHARACTER_TYPE, isCharacterType, type CharacterType } from "./rpg-hub/characterTypes.ts";
import { isValidPaletteColor, type Palette } from "./rpg-hub/palette.ts";
import type { PaletteSlot } from "../types/map.ts";

/**
 * 選んでいるキャラクターの種類・色（どちらも `character_appearances`）とやり取りする
 * （Issue #287 / #253）。
 *
 * 種類（`character_type`）と色（`accent_color` / `hair_color` / `skin_color`）は
 * 同じテーブル・行に持たせているが、**関心事としては別物**として関数を分けてある。
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
 * その利用者が選んでいる色（3枠）を取得する。
 *
 * 選んだことが無い枠（列がNULL）や、候補に無い値（過去の候補が減った場合など）は
 * `Palette` に含めない。`resolvePartColor` は指定が無い枠をパーツ側の既定色で描くため、
 * 含めないことがそのまま「既定色にフォールバック」になる。
 * @param userId - 対象の利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 選んでいる色。行が無ければ空
 */
export async function fetchCharacterPalette(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<Palette> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("character_appearances")
    .select("accent_color, hair_color, skin_color")
    .eq("user_id", userId)
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
 * 1つの枠の色を保存する。
 *
 * `user_id` が主キーなので、初回選択も選び直しも upsert 1本で済む。他の枠の列は
 * upsert のペイロードに含めないため、`ON CONFLICT` 時に他の枠を消してしまわない
 * （行が無い場合の新規作成では、他の枠は列のNULLのまま作られる）。
 * @param userId - 対象の利用者のid
 * @param slot - 保存する枠
 * @param color - 保存する色（候補の16進カラーコード）
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function savePaletteColor(
  userId: string,
  slot: PaletteSlot,
  color: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient
    .from("character_appearances")
    .upsert(
      { [PALETTE_SLOT_COLUMNS[slot]]: color, updated_at: new Date().toISOString(), user_id: userId },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
