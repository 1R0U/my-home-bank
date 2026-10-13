export type StoreItemRequestDraft = {
  imageUri: string | null;
  title: string;
  description: string;
  reason: string;
};

const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_REASON_LENGTH = 200;

/**
 * 商品追加申請フォームの入力値を検証する。
 * @param draft - フォームの入力内容
 * 子供の画面に出すので `{漢字|よみ}` のふりがな付き（`components/Furigana.tsx`、Issue #347）。
 * @returns エラーメッセージ。検証が通った場合は undefined
 */
export function validateStoreItemRequest(draft: StoreItemRequestDraft): string | undefined {
  if (!draft.imageUri) return "{商品|しょうひん}{画像|がぞう}を{選択|せんたく}してください。";

  const title = draft.title.trim();
  if (!title) return "{商品名|しょうひんめい}を{入力|にゅうりょく}してください。";
  if (title.length > MAX_TITLE_LENGTH) return `{商品名|しょうひんめい}は${MAX_TITLE_LENGTH}{文字|もじ}{以内|いない}で{入力|にゅうりょく}してください。`;

  const description = draft.description.trim();
  if (!description) return "{商品|しょうひん}の{詳細|しょうさい}を{入力|にゅうりょく}してください。";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `{商品|しょうひん}の{詳細|しょうさい}は${MAX_DESCRIPTION_LENGTH}{文字|もじ}{以内|いない}で{入力|にゅうりょく}してください。`;
  }

  const reason = draft.reason.trim();
  if (!reason) return "{欲|ほ}しい{理由|りゆう}を{入力|にゅうりょく}してください。";
  if (reason.length > MAX_REASON_LENGTH) return `{欲|ほ}しい{理由|りゆう}は${MAX_REASON_LENGTH}{文字|もじ}{以内|いない}で{入力|にゅうりょく}してください。`;
}
