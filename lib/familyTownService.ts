import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import {
  summarizeFamily,
  type FamilyAppearanceRow,
  type FamilyEquippedRow,
  type FamilyMember,
  type FamilyQuestRow,
  type FamilyUserRow,
} from "./rpg-hub/familyNpcs.ts";

/**
 * 我が家タウンに家族をNPCとして立たせるために、家族の見た目と状況を取得する（Issue #255）。
 *
 * 取るのは4つ。どれも家族の範囲だけが読める（RLS）。
 * - `users`: 名前・ロール・お財布残高。**登録順（`created_at`）で並べる**（持ち場の割り当て順になる）
 * - `character_appearances`: 色（3枠）
 * - `equipped_items`: 装備
 * - `quests`: 受注中・承認待ちのクエスト（誰に割り当てられているか）
 *
 * 見た目の組み立てと数え方は `summarizeFamily`（lib/rpg-hub/familyNpcs.ts）が持つ。
 *
 * @param familyId - 家庭のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 家族（登録順）と、家族全体の承認待ちクエスト数
 */
export async function fetchFamilyTown(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<{ familyPendingQuestCount: number; members: FamilyMember[] }> {
  const resolvedClient = await resolveClient(client);

  const usersResult = await resolvedClient
    .from("users")
    .select("id, name, role, balance")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });
  if (usersResult.error) throw usersResult.error;
  const users = (usersResult.data ?? []) as FamilyUserRow[];
  if (users.length === 0) return { familyPendingQuestCount: 0, members: [] };

  const userIds = users.map((user) => user.id);
  const [appearancesResult, equippedResult, questsResult] = await Promise.all([
    resolvedClient
      .from("character_appearances")
      .select("user_id, accent_color, hair_color, skin_color")
      .in("user_id", userIds),
    resolvedClient.from("equipped_items").select("user_id, asset_id, slot").in("user_id", userIds),
    resolvedClient
      .from("quests")
      .select("assigned_to, status")
      .eq("family_id", familyId)
      .in("status", ["accepted", "pending"]),
  ]);
  if (appearancesResult.error) throw appearancesResult.error;
  if (equippedResult.error) throw equippedResult.error;
  if (questsResult.error) throw questsResult.error;

  return summarizeFamily({
    appearances: (appearancesResult.data ?? []) as FamilyAppearanceRow[],
    equipped: (equippedResult.data ?? []) as FamilyEquippedRow[],
    quests: (questsResult.data ?? []) as FamilyQuestRow[],
    users,
  });
}
