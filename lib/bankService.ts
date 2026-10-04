import type { SupabaseClient } from "@supabase/supabase-js";
// node --test から直接読み込まれるため、拡張子まで指定する。
import { classifySupabaseError, fail, ok, type Result } from "./errors.ts";
import type { BankAccount } from "../types";
import { resolveClient } from "./supabaseClient.ts";

/**
 * Supabase の bank_accounts とやり取りする関数群。
 * Issue #65: 所持金・銀行機能をSupabaseに繋ぐ
 *
 * 各関数は client 引数で Supabase クライアントを差し替え可能（テスト用）。
 * 省略時は実クライアント（./supabase）を遅延読み込みする。
 *
 * 残高を動かす操作（預入・引き出し）は、失敗の種類で次の動作が
 * 変わるため Result 型で返す（Issue #188）。
 * `fetchBankAccount` は読み取りで、呼び出し元の useBankAccount が独自に
 * 失敗を扱っているため、従来どおり例外を投げる形のままにしている。
 */

/** 操作確定時の結果。再送でもその操作の保存済み結果が返る。 */
export type BankOperationReceipt = {
  operation_id: string;
  wallet_balance: number;
  deposit_balance: number;
  loan_balance: number;
};
export type BankOperationResult = Result<BankOperationReceipt>;

/** 指定ユーザーの銀行口座を取得する。口座が存在しない場合は null を返す。 */
export async function fetchBankAccount(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<BankAccount | null> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("bank_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as BankAccount | null) ?? null;
}

/**
 * 預入: お財布の残高を減らし、銀行預金を増やす。
 * @returns 成功か、失敗の種類。失敗しても例外は投げない
 */
export async function bankDeposit(
  userId: string,
  amount: number,
  operationId: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  return runBankOperation("bank_deposit", userId, amount, operationId, client);
}
/**
 * 引き出し: 銀行預金を減らし、お財布の残高を増やす。
 * @returns 成功か、失敗の種類。失敗しても例外は投げない
 */
export async function bankWithdraw(
  userId: string,
  amount: number,
  operationId: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  return runBankOperation("bank_withdraw", userId, amount, operationId, client);
}

async function runBankOperation(
  name: "bank_deposit" | "bank_withdraw", userId: string, amount: number,
  operationId: string, client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  try {
    const resolvedClient = await resolveClient(client);
    const { data, error } = await resolvedClient.rpc(name, {
      p_user_id: userId, p_amount: amount, p_operation_id: operationId,
    });
    if (error) return fail(classifySupabaseError(error, "write"));
    if (!data || data.operation_id !== operationId) {
      // 成功応答が欠けていても、確認待ちのIDを捨てない。
      return fail({ code: "OUTCOME_UNKNOWN" });
    }
    return ok(data as BankOperationReceipt);
  } catch (error) {
    // 応答そのものが得られない例外でもIDを保持し、安全に確認できるようにする。
    return fail({ code: "OUTCOME_UNKNOWN", detail: { dbCode: "", dbMessage: String(error) } });
  }
}
