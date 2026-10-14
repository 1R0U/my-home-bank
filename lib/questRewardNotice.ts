/**
 * タスクが承認されてゴルが入ったことを子供に知らせる（Issue #424）。
 *
 * 子供が我が家タウンへ戻ったとき、まだ見せていない承認をまとめて1枚のポップアップで知らせる。
 * 何を見せたかはDBの `quest_logs.reward_seen_at` に持つ（`mark_quest_rewards_seen`）。
 */

/** まだ見せていない承認1件（`get_unseen_quest_rewards` の1行） */
export type QuestReward = {
  /** 承認された申請（`quest_logs`）の id。見せたことを記録するときに使う */
  questLogId: string;
  /** タスクの名前 */
  title: string;
  /** 承認で入ったゴル */
  amount: number;
  /** 承認された時刻（ISO形式） */
  approvedAt: string | null;
};

/** ポップアップに出す内容 */
export type QuestRewardSummary = {
  /** 見出しの1行目（「〇〇の タスクが」「3つの タスクが」） */
  headline: string;
  /** 入ったゴルの合計 */
  totalAmount: number;
  /** 承認の件数 */
  count: number;
};

/**
 * DBの行を承認1件へ変換する。金額が数でないときは0にする（表示が壊れないように）。
 * @param row - `get_unseen_quest_rewards` の1行
 * @returns 承認1件
 */
export function toQuestReward(row: Record<string, unknown>): QuestReward {
  const amount = Number(row.amount);
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    questLogId: String(row.quest_log_id),
    title: typeof row.title === "string" && row.title.trim() !== "" ? row.title : "タスク",
  };
}

/**
 * 件数を子供向けに数える（1〜9は「つ」、10以上は「こ」）。
 * @param count - 件数
 * @returns 「3つ」「12こ」
 */
export function formatQuestRewardCount(count: number): string {
  return count < 10 ? `${count}つ` : `${count}こ`;
}

/**
 * ポップアップに出す内容をまとめる。承認が無ければ null。
 *
 * 1件なら「『おさらあらい』の タスクが」、複数なら「3つの タスクが」と出し、
 * どのタスクだったかは「くわしく みる」で一覧にする。
 * @param rewards - まだ見せていない承認
 * @returns ポップアップに出す内容
 */
export function summarizeQuestRewards(rewards: readonly QuestReward[]): QuestRewardSummary | null {
  if (rewards.length === 0) return null;
  const totalAmount = rewards.reduce((sum, reward) => sum + reward.amount, 0);
  const headline =
    rewards.length === 1
      ? `「${rewards[0].title}」の タスクが`
      : `${formatQuestRewardCount(rewards.length)}の タスクが`;
  return { count: rewards.length, headline, totalAmount };
}

/**
 * ポップアップで見せた承認の組を表すキー。
 *
 * 閉じたあと、記録の通信が終わる前に取り直しても同じ組を出し直さないために使う。
 * 新しい承認が増えたらキーが変わるので、もう一度出る。
 * @param rewards - 見せた承認
 * @returns キー（承認が無ければ null）
 */
export function questRewardsKey(rewards: readonly QuestReward[]): string | null {
  if (rewards.length === 0) return null;
  return rewards
    .map((reward) => reward.questLogId)
    .sort()
    .join(",");
}
