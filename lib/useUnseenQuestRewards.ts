import { MOCK_UNSEEN_QUEST_REWARDS } from "../constants/mockData";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { DEV_ROLE_OVERRIDE } from "./devRole";
import type { QuestReward } from "./questRewardNotice";
import { fetchUnseenQuestRewards } from "./questRewardService";
import { useResource } from "./useResource";

const NO_REWARDS: QuestReward[] = [];

/**
 * まだ見せていない承認を取得するフック（Issue #424）。
 *
 * 画面へ戻るたびに、古ければ取り直す（親の承認は別の端末で起きるので、戻ってきたときに反映する）。
 *
 * **子供だけが対象。** 大人やモックアカウント（`canUseRealData` が false）では取得せず空のまま。
 * ただし `npm run start:child`（開発用ロール）で起動したときは、DBなしで見た目を確かめられるよう
 * デモ用の承認を返す。取得に失敗したときは空にする（知らせないだけで、画面は使えるようにする）。
 * @returns まだ見せていない承認、実データかどうか（デモなら false）、取り直す関数
 */
export function useUnseenQuestRewards(): { isLive: boolean; reload: () => Promise<void>; rewards: QuestReward[] } {
  const currentUser = useCurrentUser();
  const role = useActiveRole();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData && role === "child" ? currentUser?.id : undefined;

  const { data, error, isLive, reload } = useResource<QuestReward[]>({
    errorMessage: "承認されたタスクを取得できませんでした",
    fetcher: () => fetchUnseenQuestRewards(),
    initialData: NO_REWARDS,
    key: userId ? ["unseenQuestRewards", userId] : null,
    preview: DEV_ROLE_OVERRIDE === "child" ? MOCK_UNSEEN_QUEST_REWARDS : NO_REWARDS,
  });

  return { isLive, reload, rewards: error ? NO_REWARDS : data };
}
