export type TaskReportDraft = {
  title: string;
  description: string;
};

const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * お手伝い自主報告フォームの入力値を検証する。
 * @param draft - フォームの入力内容
 * @returns エラーメッセージ。検証が通った場合は undefined
 */
export function validateTaskReport(draft: TaskReportDraft): string | undefined {
  const title = draft.title.trim();
  if (!title) return "タイトルを入力してください。";
  if (title.length > MAX_TITLE_LENGTH) return `タイトルは${MAX_TITLE_LENGTH}文字以内で入力してください。`;

  const description = draft.description.trim();
  if (!description) return "説明を入力してください。";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `説明は${MAX_DESCRIPTION_LENGTH}文字以内で入力してください。`;
  }
}
