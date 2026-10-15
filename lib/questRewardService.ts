import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { toQuestReward, type QuestReward } from "./questRewardNotice.ts";

type Client = Pick<SupabaseClient, "rpc">;

/**
 * まだ見せていない承認と、それで入ったゴルを取得する（Issue #424）。
 *
 * 本人の分はRPCがログイン中の利用者から決めるため、引数は渡さない。承認された順（古い順）で返る。
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns まだ見せていない承認
 */
export async function fetchUnseenQuestRewards(client?: Client): Promise<QuestReward[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("get_unseen_quest_rewards");
  if (error) throw error;
  return ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).map(toQuestReward);
}

/**
 * 承認を見せたことを記録する（本人の承認済みの分だけが記録される）。
 * @param questLogIds - 見せた承認（`quest_logs`）の id
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 今回あらたに記録した件数
 */
export async function markQuestRewardsSeen(questLogIds: readonly string[], client?: Client): Promise<number> {
  if (questLogIds.length === 0) return 0;
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("mark_quest_rewards_seen", {
    p_quest_log_ids: [...questLogIds],
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
