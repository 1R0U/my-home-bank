export type TaskReportDraft = {
  title: string;
  description: string;
};

const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * お手伝い自主報告フォームの入力値を検証する。
 *
 * 子供の画面に出す文言なので、`{漢字|よみ}` でふりがなを付けている（`components/Furigana.tsx`、Issue #347）。
 * @param draft - フォームの入力内容
 * @returns エラーメッセージ。検証が通った場合は undefined
 */
export function validateTaskReport(draft: TaskReportDraft): string | undefined {
  const title = draft.title.trim();
  if (!title) return "タイトルを{入力|にゅうりょく}してください。";
  if (title.length > MAX_TITLE_LENGTH) return `タイトルは${MAX_TITLE_LENGTH}{文字|もじ}{以内|いない}で{入力|にゅうりょく}してください。`;

  const description = draft.description.trim();
  if (!description) return "{説明|せつめい}を{入力|にゅうりょく}してください。";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `{説明|せつめい}は${MAX_DESCRIPTION_LENGTH}{文字|もじ}{以内|いない}で{入力|にゅうりょく}してください。`;
  }
}
