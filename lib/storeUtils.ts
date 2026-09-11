import type { StoreItem } from "../types";

/**
 * 在庫管理機能が未実装の間、「無制限在庫」を表すために使う特殊値。
 * 将来在庫管理を実装する際は、この定数を参照している箇所を洗い出すこと。
 */
export const UNLIMITED_STOCK = 999999;

export function isOutOfStock(item: Pick<StoreItem, "stock">): boolean {
  return item.stock <= 0;
}

export function hasInsufficientBalance(item: Pick<StoreItem, "price">, balance: number): boolean {
  return balance < item.price;
}

/**
 * 「購入する」ボタンを押せる状態か（ライブ接続中・在庫あり・残高が足りている場合のみ）。
 * @param options.ignoreInsufficientBalance - true の場合、残高不足によるボタン無効化を行わない。
 *   残高取得に失敗してフォールバック値（ログイン時点のスナップショット等）を表示している場合、
 *   クライアント側の残高が最新でない可能性があるため。最終的な残高チェックは
 *   purchase_store_item（サーバー側RPC）に委ねる。
 */
export function canPurchaseItem(
  item: Pick<StoreItem, "stock" | "price">,
  balance: number,
  isLive: boolean,
  options?: { ignoreInsufficientBalance?: boolean },
): boolean {
  const insufficientBalance = options?.ignoreInsufficientBalance
    ? false
    : hasInsufficientBalance(item, balance);
  return isLive && !isOutOfStock(item) && !insufficientBalance;
}

/**
 * 購入失敗時に画面へ表示する日本語メッセージを返す。
 * purchase_store_item（DB関数）は英語で raise exception するため、そのまま出さず
 * 既知の原因は固定の日本語に、それ以外は汎用メッセージにフォールバックする。
 * クライアント側で在庫切れ・残高不足が分かっている場合は flags で明示できる。
 */
export function resolvePurchaseErrorMessage(
  error: unknown,
  flags?: { outOfStock?: boolean; insufficientBalance?: boolean },
): string {
  const raw = error instanceof Error ? error.message : "";
  if (flags?.outOfStock || /out of stock/i.test(raw)) return "在庫がありません";
  if (flags?.insufficientBalance || /insufficient balance/i.test(raw)) {
    return "所持ポイントが足りません";
  }
  return "購入に失敗しました";
}

/**
 * PostgreSQL の integer 型が表現できる最大値。
 * purchase_store_item は price::integer を実行するため、これを超える価格は
 * 購入時に範囲外エラーになる。
 */
export const MAX_STORE_PRICE = 2_147_483_647;

/**
 * アイテム管理画面の価格入力をパースする。
 * 前後の空白を除いた上で、数字のみからなる文字列（1以上、PostgreSQLのinteger型の
 * 上限以下の整数）だけを受け付ける。
 * `Number()` は "1e3"（指数表記）や "10.5"（小数）、"-1"（負数）も数値へ変換して
 * しまうため、正規表現で数字のみに限定した上でパースする。
 * purchase_store_item（DB関数）側で price を integer に丸めるため、ここで整数のみに
 * 絞っておかないと一覧表示の価格と実際の請求額がずれる。
 * @returns パースできた1以上・MAX_STORE_PRICE以下の整数価格。無効な入力の場合は null
 */
export function parseStorePriceInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_STORE_PRICE) return null;

  return parsed;
}
