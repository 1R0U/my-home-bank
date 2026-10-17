import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import type { QuestRestDayRow } from "./questRestDays.ts";

/**
 * 家事をしなくていい日（`quest_rest_days`）とやり取りする（Issue #396）。
 */

/**
 * 家族のお休みの日を、範囲を決めて取得する。
 * @param familyId - 家族のid
 * @param from - 最初の日（`YYYY-MM-DD`）
 * @param to - 最後の日（`YYYY-MM-DD`）
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 子供と日付の組み合わせ（日付の順）
 */
export async function fetchQuestRestDays(
  familyId: string,
  from: string,
  to: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<QuestRestDayRow[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("quest_rest_days")
    .select("user_id, rest_on")
    .eq("family_id", familyId)
    .gte("rest_on", from)
    .lte("rest_on", to)
    .order("rest_on", { ascending: true });

  if (error) throw error;
  return (data ?? []) as QuestRestDayRow[];
}

/**
 * 選んだ子供・日付を、まとめてお休みにする（または取り消す）。親だけが呼べる。
 * @param userIds - 子供のid
 * @param days - 日付（`YYYY-MM-DD`）
 * @param isRest - true ならお休みにし、false なら取り消す
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 変わった件数
 */
export async function setQuestRestDays(
  userIds: readonly string[],
  days: readonly string[],
  isRest: boolean,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<number> {
  if (userIds.length === 0) throw new Error("子供を1人以上選んでください");
  if (days.length === 0) throw new Error("日付を1日以上選んでください");

  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("set_quest_rest_days", {
    p_days: [...days],
    p_is_rest: isRest,
    p_user_ids: [...userIds],
  });
  if (error) throw error;
  return Number(data ?? 0);
}
