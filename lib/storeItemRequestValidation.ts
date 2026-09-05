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
 * @returns エラーメッセージ。検証が通った場合は undefined
 */
export function validateStoreItemRequest(draft: StoreItemRequestDraft): string | undefined {
  if (!draft.imageUri) return "商品画像を選択してください。";

  const title = draft.title.trim();
  if (!title) return "商品名を入力してください。";
  if (title.length > MAX_TITLE_LENGTH) return `商品名は${MAX_TITLE_LENGTH}文字以内で入力してください。`;

  const description = draft.description.trim();
  if (!description) return "商品の詳細を入力してください。";
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `商品の詳細は${MAX_DESCRIPTION_LENGTH}文字以内で入力してください。`;
  }

  const reason = draft.reason.trim();
  if (!reason) return "欲しい理由を入力してください。";
  if (reason.length > MAX_REASON_LENGTH) return `欲しい理由は${MAX_REASON_LENGTH}文字以内で入力してください。`;
}
