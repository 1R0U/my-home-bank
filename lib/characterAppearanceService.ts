import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { DEFAULT_CHARACTER_TYPE, isCharacterType, type CharacterType } from "./rpg-hub/characterTypes.ts";

/**
 * 選んでいるキャラクターの種類（`character_appearances`）とやり取りする（Issue #287）。
 *
 * 保存するのは種類を表す文字列だけ。見た目（形・アンカー）は
 * `lib/rpg-hub/catalog.ts` が持つ。色（palette）とは別の仕組み（#253）。
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
