import type { TransactionType } from "../types";

/**
 * 取引の収支分類。
 *
 * - `income`   : 家庭内通貨が新しく手に入る取引（クエスト報酬・預金利息）
 * - `expense`  : 家庭内通貨を使ってなくなる取引（ストアでの交換）
 * - `transfer` : 持っている通貨の置き場所が変わるだけの取引（預入・引き出し・借り入れ・返済）
 */
export type CashFlowClass = "income" | "expense" | "transfer";

/**
 * 取引種別ごとの収支分類（Issue #143）。
 *
 * 【分類の基準】
 * 「財布 + 預金 − 借金」（＝そのユーザーが保有する家庭内通貨の総量）が
 * 増減するかどうかで分ける。
 *
 *   クエスト報酬 +30  → 財布+30                → 総量+30  → income
 *   ストア購入   -50  → 財布-50                → 総量-50  → expense
 *   預入        -30  → 財布-30 / 預金+30      → 総量0    → transfer
 *   引き出し     +30  → 財布+30 / 預金-30      → 総量0    → transfer
 *   借り入れ    +100  → 財布+100 / 借金+100    → 総量0    → transfer
 *   返済       -100  → 財布-100 / 借金-100    → 総量0    → transfer
 *   預金利息     +2  → 預金+2                 → 総量+2   → income
 *
 * 借り入れた通貨を実際に使ったときは `store_purchase` として支出に出るため、
 * 借り入れを transfer にしても支出が漏れることはない。
 *
 * 【`transactions` への記帳方針の変遷】
 * `supabase/migrations/20260904000000_connect_bank.sql` の冒頭コメントには
 * 「お財布↔銀行預金の振替は家庭内通貨の総量が変わらないため transactions に
 * 記録しない」という当初の方針が書かれている。その後 Issue #134 の完了条件
 * （各操作を取引履歴へ記録し、操作種別と金額を確認できるようにする）に合わせ、
 * `20260907000000_record_bank_transfer_history.sql` で振替系も記帳する方針へ
 * 変更した。
 *
 * 現在の方針は「台帳（transactions）には全操作を記帳する。収支として数えるか
 * どうかは、この分類表で決める」である。記帳するかどうかと、収支に数えるか
 * どうかは別の判断として扱う。
 *
 * 【新しい取引種別を追加するとき】
 * `TransactionType` に種別を足すと、この表に分類が無い場合は `satisfies` により
 * 型チェック（`npx tsc --noEmit`）で失敗する。符号や名前から推測して暗黙に
 * 収入・支出へ流れることはない。
 */
export const CASH_FLOW_CLASS_BY_TYPE = {
  quest_reward: "income",
  bank_interest: "income",
  store_purchase: "expense",
  bank_deposit: "transfer",
  bank_withdraw: "transfer",
  bank_loan: "transfer",
  bank_repay: "transfer",
} satisfies Record<TransactionType, CashFlowClass>;

/**
 * 取引種別から収支分類を求める。
 *
 * DBや通信から未知の種別が届いた場合は、収入・支出のどちらにも寄せず `null` を返す。
 * 呼び出し側は「分類できなかった取引」として、集計から除外する・中立に表示するなど
 * 明示的に扱うこと。
 *
 * @param type - 取引種別。未知の文字列が渡されうるため `string` で受ける
 * @returns 収支分類。未知の種別の場合は `null`
 */
export function classifyCashFlow(type: string): CashFlowClass | null {
  // プロトタイプ由来のプロパティ（"toString" など）を誤って分類しないよう、
  // 自身が持つキーだけを対象にする。
  if (!Object.hasOwn(CASH_FLOW_CLASS_BY_TYPE, type)) return null;
  return CASH_FLOW_CLASS_BY_TYPE[type as TransactionType];
}
