import { toFamilyCalendarDate } from "./familyTime.ts";
import type { MapRouteId } from "../types/map";

/**
 * お知らせを押したときに開ける画面の種類（Issue #354）。
 *
 * 画面のパスではなく、町の建物と同じ「何の建物か」（`MapRouteId`）で持つ。
 * 大人と子供でタスク・ストアの画面が違うため、実際の遷移先は開く人のロールから
 * `resolveMapRoute` が決める。DBの `notifications_route_allowed` 制約と同じ値にそろえる。
 */
export const NOTIFICATION_ROUTES = ["bank", "history", "store", "tasks"] as const satisfies readonly MapRouteId[];

/** お知らせから開ける画面の種類。 */
export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];

/**
 * 掲示板に出す、1人あてのお知らせ（`notifications` の1行）。
 * `read_at` が null のものが未読。
 */
export type AppNotification = {
  body: string;
  created_at: string;
  id: string;
  read_at: string | null;
  route: NotificationRoute | null;
  title: string;
  user_id: string;
};

/**
 * 掲示板で一度に読むお知らせの上限（Issue #354）。
 *
 * 新しい順にこの件数までを取る（`fetchNotifications`）。お知らせは本人あてだけで、
 * 1日に何十件も届く想定ではないため、ページ送りは持たない。
 * 未読がこれを超えると一覧に並びきらないので、掲示板は一覧の下でそのことを知らせる。
 */
export const NOTIFICATION_FETCH_LIMIT = 100;

/** 掲示板のタブ。 */
export type NotificationTab = "read" | "unread";

/** タブの見出し。 */
export const NOTIFICATION_TAB_LABELS: Record<NotificationTab, string> = {
  read: "既読",
  unread: "未読",
};

/**
 * 値がお知らせから開ける画面の種類かどうかを判定する。
 * @param value - 判定する値
 * @returns 開ける画面の種類なら true
 */
export function isNotificationRoute(value: unknown): value is NotificationRoute {
  return typeof value === "string" && (NOTIFICATION_ROUTES as readonly string[]).includes(value);
}

/**
 * DBの行をお知らせへ変換する。
 *
 * 行き先が知らない値のときは、行ごと捨てずに「行き先なし」にする。
 * 新しい行き先がDBへ先に足され、アプリが追いついていない場合でも、お知らせ自体は読めるようにするため。
 * @param row - `notifications` の1行
 * @returns お知らせ
 */
export function toAppNotification(row: Record<string, unknown>): AppNotification {
  return {
    body: typeof row.body === "string" ? row.body : "",
    created_at: String(row.created_at),
    id: String(row.id),
    read_at: typeof row.read_at === "string" ? row.read_at : null,
    route: isNotificationRoute(row.route) ? row.route : null,
    title: String(row.title),
    user_id: String(row.user_id),
  };
}

/**
 * 届いた時刻の新しい順に並べる。元の配列は変えない。
 * @param notifications - お知らせ一覧
 * @returns 新しい順に並べた配列
 */
function sortNewestFirst(notifications: readonly AppNotification[]): AppNotification[] {
  return [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * 未読と既読に分け、それぞれ新しい順に並べる。
 * @param notifications - お知らせ一覧
 * @returns タブごとのお知らせ
 */
export function splitNotificationsByTab(
  notifications: readonly AppNotification[],
): Record<NotificationTab, AppNotification[]> {
  const sorted = sortNewestFirst(notifications);
  return {
    read: sorted.filter((notification) => notification.read_at !== null),
    unread: sorted.filter((notification) => notification.read_at === null),
  };
}

/**
 * 未読の件数を数える。
 * @param notifications - お知らせ一覧
 * @returns 未読の件数
 */
export function countUnreadNotifications(notifications: readonly AppNotification[]): number {
  return notifications.filter((notification) => notification.read_at === null).length;
}

/**
 * 指定したお知らせを既読にした一覧を返す（DBの応答を待たずに画面へ反映するため）。
 *
 * DBの `mark_notifications_read` と同じく、すでに既読のものの時刻は変えない。
 * @param notifications - お知らせ一覧
 * @param ids - 既読にするid。null ならすべて
 * @param readAt - 既読にした時刻（ISO形式）
 * @returns 既読を反映した新しい配列
 */
export function markNotificationsReadLocally(
  notifications: readonly AppNotification[],
  ids: readonly string[] | null,
  readAt: string,
): AppNotification[] {
  const targets = ids === null ? null : new Set(ids);
  return notifications.map((notification) =>
    notification.read_at === null && (targets === null || targets.has(notification.id))
      ? { ...notification, read_at: readAt }
      : notification,
  );
}

/**
 * 届いた時刻を、家庭の暦（日本時間）で「10/7 9:05」の形にする。
 * 今年でないものは年も付ける（「2025/12/31 23:59」）。
 * @param isoDate - 届いた時刻（ISO形式）
 * @param now - いまの時刻（テスト用。省略時は現在）
 * @returns 表示用の文字列
 */
export function formatNotificationTime(isoDate: string, now: Date = new Date()): string {
  const date = toFamilyCalendarDate(isoDate);
  const today = toFamilyCalendarDate(now.toISOString());
  const monthDay = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  const time = `${date.getUTCHours()}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  const prefix = date.getUTCFullYear() === today.getUTCFullYear() ? "" : `${date.getUTCFullYear()}/`;
  return `${prefix}${monthDay} ${time}`;
}
