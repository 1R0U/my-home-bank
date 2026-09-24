/**
 * 利用者のプロフィール（生年月日・性別）の値の扱い（Issue #277）。
 *
 * DB の `users.birth_date`（date）と `users.gender`（text）に保存する。どちらも任意で、
 * null は「未設定」を表す。値の制約は DB 側（20260924000100_add_user_birth_date_gender.sql）
 * とそろえてある。
 */

/** 性別。DB の `users_gender_check` が許可する値と同じ。「答えない」は null で表す。 */
export type Gender = "male" | "female" | "other";

/** 性別の選択肢（表示順）。 */
export const GENDER_OPTIONS: readonly { label: string; value: Gender }[] = [
  { label: "男性", value: "male" },
  { label: "女性", value: "female" },
  { label: "その他", value: "other" },
];

/** 未設定のときの表示。 */
export const UNSET_LABEL = "未設定";

/** DB の `users_birth_date_check` と同じ下限。 */
const OLDEST_BIRTH_DATE = "1900-01-01";

/**
 * 値が性別として有効かを判定する。
 * @param value - 判定する値
 * @returns 有効な性別なら true
 */
export function isGender(value: unknown): value is Gender {
  return GENDER_OPTIONS.some((option) => option.value === value);
}

/**
 * 性別の表示名を返す。
 * @param gender - 性別。未設定なら null
 * @returns 表示名
 */
export function formatGender(gender: Gender | null): string {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? UNSET_LABEL;
}

/**
 * 生年月日（`YYYY-MM-DD`）を画面向けの `YYYY/MM/DD` にする。
 * @param birthDate - DB の形式の生年月日。未設定なら null
 * @returns 表示用の文字列。未設定なら空文字
 */
export function formatBirthDateInput(birthDate: string | null): string {
  return birthDate ? birthDate.replace(/-/g, "/") : "";
}

/**
 * 日付を `YYYY-MM-DD` の文字列にする（端末のローカル時刻の年月日で読む）。
 * @param date - 日付
 * @returns `YYYY-MM-DD`
 */
function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type BirthDateParseResult =
  | { error: null; value: string | null }
  | { error: string; value: null };

/**
 * 入力された生年月日を解釈して検証する。
 *
 * `2015/04/12`・`2015-4-12`・`2015.04.12`・`20150412` のどれでも受け付ける。
 * 空欄は「未設定」（null）として扱う。
 * @param input - 入力された文字列
 * @param today - 今日（テスト用に差し替えられる）
 * @returns 成功時は `YYYY-MM-DD`（未設定なら null）、失敗時は理由
 */
export function parseBirthDateInput(input: string, today: Date = new Date()): BirthDateParseResult {
  const trimmed = input.trim();
  if (trimmed === "") return { error: null, value: null };

  const match =
    trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/) ?? trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    return { error: "生年月日は 2015/04/12 のように入力してください", value: null };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // 2月30日のような存在しない日付は、Date が翌月へ繰り上げるので見分けられる
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { error: "存在しない日付です", value: null };
  }

  const value = toDateString(date);
  if (value > toDateString(today)) {
    return { error: "未来の日付は入力できません", value: null };
  }
  if (value < OLDEST_BIRTH_DATE) {
    return { error: "1900年以降の日付を入力してください", value: null };
  }
  return { error: null, value };
}

export type ProfileDraftState = {
  /** 生年月日の入力を解釈した結果。保存する値か、入力の誤り */
  birthDate: BirthDateParseResult;
  /** 保存できるか（入力が正しく、保存済みの値から変わっている） */
  canSave: boolean;
};

/**
 * 編集中の生年月日・性別を保存できるかを決める。
 * @param draftBirthDate - 入力中の生年月日（画面の文字列）
 * @param draftGender - 選択中の性別
 * @param current - 保存済みの値
 * @param current.birthDate - 保存済みの生年月日（`YYYY-MM-DD`）
 * @param current.gender - 保存済みの性別
 * @param today - 今日（テスト用に差し替えられる）
 * @returns 解釈した生年月日と、保存できるか
 */
export function getProfileDraftState(
  draftBirthDate: string,
  draftGender: Gender | null,
  current: { birthDate: string | null; gender: Gender | null },
  today: Date = new Date(),
): ProfileDraftState {
  const birthDate = parseBirthDateInput(draftBirthDate, today);
  const changed = birthDate.value !== current.birthDate || draftGender !== current.gender;
  return { birthDate, canSave: birthDate.error === null && changed };
}
