/**
 * 生年月日の入力値を検証する。
 * @param yearText - 年（4桁の文字列）
 * @param monthText - 月（1〜2桁の文字列）
 * @param dayText - 日（1〜2桁の文字列）
 * @param today - 現在日時（デフォルトは new Date()。テスト用に上書き可能）
 * @returns エラーメッセージ。検証が通った場合は undefined
 */
export function validateBirthDate(
  yearText: string,
  monthText: string,
  dayText: string,
  today = new Date(),
): string | undefined {
  if (!/^\d{4}$/.test(yearText) || !/^\d{1,2}$/.test(monthText) || !/^\d{1,2}$/.test(dayText)) {
    return "生年月日を正しく入力してください。";
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const birthDate = new Date(year, month - 1, day);

  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return "存在しない日付です。生年月日を確認してください。";
  }

  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birthDate > currentDate) {
    return "未来の日付は入力できません。";
  }

  const oldestAllowedDate = new Date(
    currentDate.getFullYear() - 120,
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  if (birthDate < oldestAllowedDate) {
    return "120歳を超える生年月日は入力できません。";
  }
}
