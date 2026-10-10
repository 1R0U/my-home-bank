import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { isQuestStreakMilestone, toQuestStreak, type QuestStreak } from "./questStreak.ts";

type Client = Pick<SupabaseClient, "rpc">;

/**
 * 連続記録を取得する（Issue #372）。
 *
 * 子供でない人の記録は0日として返る。同じ家族の人の記録も見られる（掲示板 #355 用）。
 * @param userId - 見たい人の id。省略すると自分の記録
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 連続記録
 */
export async function fetchQuestStreak(userId?: string, client?: Client): Promise<QuestStreak> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("get_quest_streak", { p_user_id: userId ?? null });
  if (error) throw error;
  // returns table の関数なので配列で返る（行は必ず1つ）
  const row = Array.isArray(data) ? data[0] : undefined;
  return toQuestStreak(row as Record<string, unknown> | undefined);
}

/**
 * キリのいい日数のお祝いを出したことを記録する（子供本人だけが呼べる）。
 *
 * 同じお祝いを二度記録しようとしても、DBは何もしない（false を返す）。
 * @param milestoneDays - お祝いした日数
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 今回あらたに記録したか
 */
export async function recordQuestStreakCelebration(milestoneDays: number, client?: Client): Promise<boolean> {
  if (!isQuestStreakMilestone(milestoneDays)) {
    throw new Error("キリのいい日数ではありません");
  }
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("record_quest_streak_celebration", {
    p_milestone_days: milestoneDays,
  });
  if (error) throw error;
  return data === true;
}
