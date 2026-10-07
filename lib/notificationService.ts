import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { toAppNotification, type AppNotification } from "./notifications.ts";

/**
 * 掲示板で一度に読むお知らせの上限（Issue #354）。
 *
 * 新しい順にこの件数までを取る。お知らせは本人あてだけで、1日に何十件も届く
 * 想定ではないため、ページ送りは持たない。
 */
export const NOTIFICATION_FETCH_LIMIT = 100;

/**
 * 自分あてのお知らせを新しい順に取得する。
 *
 * RLS（`notifications_select_self`）でも本人の行に絞られるが、不要な行を取らないよう
 * クライアント側でも利用者で絞る（ほかの取得処理と同じ方針）。
 * @param userId - ログイン中の利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns お知らせ一覧（新しい順）
 */
export async function fetchNotifications(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<AppNotification[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("notifications")
    .select("id, user_id, title, body, route, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_FETCH_LIMIT);

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toAppNotification);
}

/**
 * 自分あての未読のお知らせの件数を数える。
 *
 * 一覧（`fetchNotifications`）は上限までしか取らないので、ベルのバッジなどに出す件数は
 * 一覧から数えず、こちらでDB上の件数を数える。行そのものは取らない（`head: true`）。
 * @param userId - ログイン中の利用者のid
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 未読の件数
 */
export async function fetchUnreadNotificationCount(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<number> {
  const resolvedClient = await resolveClient(client);
  const { count, error } = await resolvedClient
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * 自分あてのお知らせを既読にする。
 *
 * 既読の時刻はDBが決める（端末の時計に左右されないように）。
 * @param ids - 既読にするお知らせのid。null なら自分あての未読すべて
 * @param client - Supabaseクライアント（テスト時に差し替え可能。省略時は実クライアント）
 * @returns 今回あらたに既読にした件数
 */
export async function markNotificationsRead(
  ids: readonly string[] | null,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<number> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("mark_notifications_read", {
    p_notification_ids: ids === null ? null : [...ids],
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
