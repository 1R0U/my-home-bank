import { supabase } from "./supabase";
import type { Quest, QuestLog } from "../types";

/**
 * Supabase の quests / quest_logs テーブルとやり取りする関数群。
 * Issue #63: タスク機能をSupabaseに繋ぐ
 *
 * 注意（既知の割り切り）:
 * - quests.assigned_to は「受注した子」を記録するが、承認/却下は family 内の
 *   どの親でも行える想定（親を限定するロジックはPhase 2以降で検討）。
 * - 却下されたクエストは status='open' / assigned_to=null に戻り、誰でも再受注できる。
 */

export async function fetchQuests(): Promise<Quest[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Quest[];
}

export type CreateQuestInput = {
  title: string;
  description: string;
  reward_amount: number;
  category: Quest["category"];
  created_by: string;
};

export async function createQuest(input: CreateQuestInput): Promise<Quest> {
  const { data, error } = await supabase
    .from("quests")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as Quest;
}

/** 子がクエストを受注する。他の子に先に受注されていた場合は0件更新になり例外を投げる。 */
export async function acceptQuest(questId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("quests")
    .update({ status: "accepted", assigned_to: userId })
    .eq("id", questId)
    .eq("status", "open")
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("このクエストは既に他の人が受注しています");
  }
}

/**
 * 子が完了報告する。
 * quest_logs への申請作成と quests の承認待ち更新をDB側の1トランザクションで行う
 * （accepted かつ自分が受注中であることをDB側で検証し、途中失敗時は全てロールバックする。
 * 連打などで複数回呼ばれても、2回目以降は status がすでに pending のため失敗し、
 * quest_logs が重複作成されない）。
 */
export async function submitQuestCompletion(questId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("submit_quest_completion", {
    p_quest_id: questId,
    p_user_id: userId,
  });

  if (error) throw error;
}

/** 承認待ちのクエストに対応する quest_log（未承認・未却下の最新申請）を取得する。 */
export async function fetchPendingLogForQuest(questId: string): Promise<QuestLog | null> {
  const { data, error } = await supabase
    .from("quest_logs")
    .select("*")
    .eq("quest_id", questId)
    .eq("status", "pending")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as QuestLog | null) ?? null;
}

/** 承認: quest_logs→quests→transactions→users.balance の更新を1トランザクションで行う。 */
export async function approveQuestLog(questLogId: string, approverId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_quest_log", {
    p_quest_log_id: questLogId,
    p_approver_id: approverId,
  });

  if (error) throw error;
}

/** 却下: quest_logs を rejected にし、quests を未受注（open/assigned_to=null）に戻す。 */
export async function rejectQuestLog(questLogId: string, approverId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_quest_log", {
    p_quest_log_id: questLogId,
    p_approver_id: approverId,
  });

  if (error) throw error;
}
