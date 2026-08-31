import { toUsersTablePatch, type SettingsState } from "./settings";
import { supabase } from "./supabase";

/**
 * Supabase の users テーブルと設定内容をやり取りする関数群。
 * Issue #75: 設定内容をSupabaseに保存する
 */

export async function fetchUserSettings(userId: string): Promise<SettingsState> {
  const { data, error } = await supabase
    .from("users")
    .select("name, notifications_enabled")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return {
    name: data.name as string,
    notificationsEnabled: data.notifications_enabled as boolean,
  };
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<SettingsState>,
): Promise<void> {
  const payload = toUsersTablePatch(patch);
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("users").update(payload).eq("id", userId);
  if (error) throw error;
}
