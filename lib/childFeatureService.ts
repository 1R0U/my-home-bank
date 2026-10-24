import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildFeature } from "../types/index";
import { resolveClient } from "./supabaseClient.ts";
import type { ChildFeatureRestrictionRow } from "./childFeatures.ts";

/**
 * 子供ごとの機能の使う・使わない（`child_feature_restrictions`）とやり取りする（Issue #348）。
 */

/**
 * 家族の「使わない」にした機能を取得する。
 * @param familyId - 家族のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 子供と機能の組み合わせ
 */
export async function fetchChildFeatureRestrictions(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<ChildFeatureRestrictionRow[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("child_feature_restrictions")
    .select("user_id, feature")
    .eq("family_id", familyId);

  if (error) throw error;
  return (data ?? []) as ChildFeatureRestrictionRow[];
}

/**
 * 子供の機能を、使う・使わないに切り替える。親だけが呼べる。
 * @param userId - 子供のid
 * @param feature - 機能
 * @param enabled - true なら使う、false なら使わない
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 */
export async function setChildFeatureEnabled(
  userId: string,
  feature: ChildFeature,
  enabled: boolean,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("set_child_feature_enabled", {
    p_enabled: enabled,
    p_feature: feature,
    p_user_id: userId,
  });
  if (error) throw error;
}
