import type { Quest } from "../types/index.ts";

type DeadlineQuest = Partial<Pick<Quest, "category" | "expires_at">>;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

/** 期限の入力・表示は日本時間に統一し、保存はUTCにする。 */
export function formatQuestDeadline(value: string): string {
  const date = new Date(Date.parse(value) + JST_OFFSET_MS);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(date.getUTCFullYear()).padStart(4, "0")}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** 空欄は期限なし。存在しない日付や24時などを翌日へ繰り上げず拒否する。 */
export function parseQuestDeadlineInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2}) (\d{2}):(\d{2})$/.exec(value);
  const canonical = match && `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
  const timestamp = match && Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`);
  if (!match || Number(match[1]) < 1 || !Number.isFinite(timestamp) || formatQuestDeadline(new Date(timestamp).toISOString()) !== canonical) {
    throw new Error("期限は実在する日時を YYYY/MM/DD HH:mm で入力してください");
  }
  return new Date(timestamp).toISOString();
}

export function questDeadlineTime(quest: DeadlineQuest): number | null {
  if (quest.category !== "limited" || !quest.expires_at) return null;
  const time = Date.parse(quest.expires_at);
  return Number.isFinite(time) ? time : null;
}

/** 設定した日時ちょうどから期限切れ。最終的な受付可否はDBの時計で決める。 */
export function isQuestExpired(quest: DeadlineQuest, now = Date.now()): boolean {
  const deadline = questDeadlineTime(quest);
  return deadline !== null && now >= deadline;
}

export function questDeadlineLabel(quest: DeadlineQuest, now = Date.now()): string | null {
  if (quest.category !== "limited") return null;
  const deadline = questDeadlineTime(quest);
  if (deadline === null) return "期限なし";
  const remaining = deadline - now;
  if (remaining <= 0) return "期限切れ";
  if (remaining < MINUTE_MS) return "あと1分未満";
  if (remaining < HOUR_MS) return `あと${Math.ceil(remaining / MINUTE_MS)}分`;
  if (remaining < DAY_MS) return `あと${Math.ceil(remaining / HOUR_MS)}時間`;
  return `あと${Math.ceil(remaining / DAY_MS)}日`;
}

export function questDeadlineLabelForChild(quest: DeadlineQuest, now = Date.now()): string | null {
  return questDeadlineLabel(quest, now)
    ?.replace("期限なし", "{期限|きげん}なし")
    .replace("期限切れ", "{期限切|きげんぎ}れ")
    .replace("未満", "{未満|みまん}")
    .replace("時間", "{時間|じかん}") ?? null;
}
