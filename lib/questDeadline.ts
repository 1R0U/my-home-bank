import type { Quest } from "../types/index.ts";

export type DeadlineQuest = Partial<Pick<Quest, "category" | "expires_at">>;
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

/** 日時選択・編集で保存できない値なら理由を返し、期限なしは有効として扱う。 */
export function questDeadlineInputError(value: string): string | null {
  try {
    parseQuestDeadlineInput(value);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** 日時選択ダイアログの値。月は1〜12、時刻は24時間表記。 */
export type QuestDeadlineParts = { year: number; month: number; day: number; hour: number; minute: number };

/** 指定月の日数。うるう年と1〜99年も西暦どおりに扱う。 */
export function questDeadlineDaysInMonth(year: number, month: number): number {
  const date = new Date(0);
  // Date.UTCの0〜99年が1900年代になる補正を避ける。
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

/** 未設定の場合は翌日18時を候補にする。確定するまでは期限として保存しない。 */
export function questDeadlineParts(value: string, now = Date.now()): QuestDeadlineParts {
  let text: string;
  try {
    const parsed = parseQuestDeadlineInput(value);
    text = parsed ? formatQuestDeadline(parsed) : "";
  } catch {
    text = "";
  }
  if (!text) text = `${formatQuestDeadline(new Date(now + DAY_MS).toISOString()).slice(0, 10)} 18:00`;
  const [year, month, day, hour, minute] = text.split(/[/: ]/).map(Number);
  return { year, month, day, hour, minute };
}

/** 月末やうるう年をまたぐ変更では、日をその月の末日までに収める。 */
export function changeQuestDeadlinePart(
  parts: QuestDeadlineParts,
  part: keyof QuestDeadlineParts,
  value: number,
): QuestDeadlineParts {
  const next = { ...parts, [part]: value };
  return { ...next, day: Math.min(next.day, questDeadlineDaysInMonth(next.year, next.month)) };
}

/** 日時選択の値を、日本時間の保存前の文字列へそろえる。 */
export function formatQuestDeadlineParts(parts: QuestDeadlineParts): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(parts.year, 4)}/${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 限定タスクの有効な期限だけをミリ秒で返す。期限なしはnull。 */
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

/** 未受注・受注中だけを期限による受付終了とする。承認待ち・完了済みは進行状態を保つ。 */
export function isQuestClosedByDeadline(quest: DeadlineQuest & { status: string }, now = Date.now()): boolean {
  return (quest.status === "open" || quest.status === "accepted") && isQuestExpired(quest, now);
}

/** 残り時間を切り捨てて表示し、実際より長い猶予があるように見せない。 */
export function questDeadlineLabel(quest: DeadlineQuest, now = Date.now()): string | null {
  if (quest.category !== "limited") return null;
  const deadline = questDeadlineTime(quest);
  if (deadline === null) return "期限なし";
  const remaining = deadline - now;
  if (remaining <= 0) return "期限切れ";
  if (remaining < MINUTE_MS) return "あと1分未満";
  if (remaining < HOUR_MS) return `あと${Math.floor(remaining / MINUTE_MS)}分`;
  if (remaining < DAY_MS) return `あと${Math.floor(remaining / HOUR_MS)}時間`;
  return `あと${Math.floor(remaining / DAY_MS)}日`;
}

/** 子供用の期限ラベルにふりがなを付ける。 */
export function questDeadlineLabelForChild(quest: DeadlineQuest, now = Date.now()): string | null {
  return questDeadlineLabel(quest, now)
    ?.replace("期限なし", "{期限|きげん}なし")
    .replace("期限切れ", "{期限切|きげんぎ}れ")
    .replace("未満", "{未満|みまん}")
    .replace("時間", "{時間|じかん}") ?? null;
}
