import type { Quest, QuestCategory } from "../types/index.ts";
import { formatQuestDeadline } from "./questDeadline.ts";
import { FAMILY_UTC_OFFSET_HOURS } from "./familyTime.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = FAMILY_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/** 日曜日を0、土曜日を6とする。 */
export type QuestWeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type QuestPeriod = { startsAt: string; endsAt: string };

/** 同じ設定の古い申請を除き、表示中の各クエストの最新の期間で再取得を予約する。 */
export function questPeriodRefreshAt(quests: readonly Quest[]): number {
  const ends = new Map<string, number>();
  for (const quest of quests) {
    const end = Date.parse(quest.period_ends_at ?? "");
    if (!Number.isFinite(end)) continue;
    const key = quest.recurrence_source_id ?? quest.id;
    ends.set(key, Math.max(ends.get(key) ?? -Infinity, end));
  }
  return Math.min(...ends.values());
}

/** 終了時刻を日本時間の0時からの分数へ変換する。未入力・存在しない時刻は受け付けない。 */
export function parseQuestDailyEndTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 親の一覧と詳細で、担当と期間を同じ表現にする。名前が取得できなくても担当方式を残す。 */
export function questAssignmentLabel(quest: Quest, members: readonly { id: string; name: string }[]): string {
  const targetId = quest.target_child_id ?? quest.assigned_to;
  const name = members.find((member) => member.id === targetId)?.name;
  if (quest.audience === "all") return `全員：${name ?? "対象の子"}`;
  if (quest.audience === "specific") return `担当：${name ?? "指定の子"}`;
  return name ? `先着1人：${name}` : "先着1人";
}

export function questPeriodLabel(quest: Quest, now = Date.now()): string | null {
  if (!quest.period_starts_at || !quest.period_ends_at) return null;
  const prefix = Date.parse(quest.period_ends_at) <= now ? "前の期間：" : "期間：";
  return `${prefix}${formatQuestDeadline(quest.period_starts_at)} 〜 ${formatQuestDeadline(quest.period_ends_at)}（日本時間）`;
}

/**
 * 日本時間で、現在の日時を含むクエストの期間を返す。
 * 開始日時を含み、終了日時は次の期間に含める。限定クエストには繰り返し期間がない。
 * ウィークリーの開始曜日は必須とし、未設定を勝手に月曜日として扱わない。
 */
export function currentQuestPeriod(
  category: QuestCategory,
  weekStartDay: QuestWeekStartDay | null,
  now = Date.now(),
  dailyEndMinutes = 0,
): QuestPeriod | null {
  if (category === "limited") return null;
  if (!Number.isFinite(now)) throw new Error("クエストの期間を計算する日時が不正です");
  if (category === "weekly" && (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6)) {
    throw new Error("ウィークリーの開始曜日を指定してください");
  }

  const calendar = new Date(now + OFFSET_MS);
  if (!Number.isFinite(calendar.getTime())) throw new Error("クエストの期間を計算する日時が不正です");
  const daysSinceStart = category === "weekly" ? (calendar.getUTCDay() - weekStartDay + 7) % 7 : 0;
  calendar.setUTCHours(0, 0, 0, 0);
  if (category === "daily") {
    if (!Number.isInteger(dailyEndMinutes) || dailyEndMinutes < 0 || dailyEndMinutes > 1439) {
      throw new Error("デイリーの終了時刻を指定してください");
    }
    calendar.setUTCMinutes(dailyEndMinutes);
    if (calendar.getTime() - OFFSET_MS > now) calendar.setUTCDate(calendar.getUTCDate() - 1);
  }
  const startsAt = calendar.getTime() - OFFSET_MS - daysSinceStart * DAY_MS;
  const endsAt = startsAt + (category === "weekly" ? 7 : 1) * DAY_MS;
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
}
