import { useCurrentUser, useDataAccess } from "../store";
import { fetchUnreadNotificationCount } from "./notificationService";
import { useResource } from "./useResource";

/**
 * 自分あての未読のお知らせの件数だけを取得するフック（Issue #354）。
 *
 * 大人ホームのベルのバッジ用。ホームでは件数しか使わないので、お知らせの一覧
 * （`useNotifications`。最大100件）は取らずに件数だけを数える。
 * 画面へ戻るたびに取り直す（タブの裏で生存し続ける大人ホームでも、件数が古いままにならないように）。
 *
 * **モックアカウント（`canUseRealData` が false）では0のまま。**
 * 取得に失敗したときも0にする（バッジを出さないだけで、ホームは使えるようにする）。
 * @returns 未読の件数
 */
export function useUnreadNotificationCount(): number {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id : undefined;

  const { data, error } = useResource<number>({
    errorMessage: "未読のお知らせの件数を取得できませんでした",
    fetcher: () => fetchUnreadNotificationCount(userId),
    initialData: 0,
    key: userId ? ["unreadNotificationCount", userId] : null,
  });

  return error ? 0 : data;
}
