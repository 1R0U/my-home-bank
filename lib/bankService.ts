import type { SupabaseClient } from "@supabase/supabase-js";
// node --test から直接読み込まれるため、拡張子まで指定する。
import { classifySupabaseError, fail, ok, type Result } from "./errors.ts";
import type { BankAccount } from "../types";

/**
 * Supabase の bank_accounts とやり取りする関数群。
 * Issue #65: 所持金・銀行機能をSupabaseに繋ぐ
 *
 * 各関数は client 引数で Supabase クライアントを差し替え可能（テスト用）。
 * 省略時は実クライアント（./supabase）を遅延読み込みする。
 *
 * 残高を動かす4操作（預入・引き出し・借り入れ・返済）は、失敗の種類で次の動作が
 * 変わるため Result 型で返す（Issue #188）。
 * `fetchBankAccount` は読み取りで、呼び出し元の useBankAccount が独自に
 * 失敗を扱っているため、従来どおり例外を投げる形のままにしている。
 */

/** 残高を動かす操作の結果。成功時に返す値はない。 */
export type BankOperationResult = Result<null>;

async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

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
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("bank_deposit", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) return fail(classifySupabaseError(error, "write"));
  return ok(null);
}

/**
 * 引き出し: 銀行預金を減らし、お財布の残高を増やす。
 * @returns 成功か、失敗の種類。失敗しても例外は投げない
 */
export async function bankWithdraw(
  userId: string,
  amount: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("bank_withdraw", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) return fail(classifySupabaseError(error, "write"));
  return ok(null);
}

/**
 * 借り入れ: 借入残高とお財布の残高を増やし、transactionsにbank_loanとして記帳する。
 * @returns 成功か、失敗の種類。失敗しても例外は投げない
 */
export async function bankBorrow(
  userId: string,
  amount: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("bank_borrow", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) return fail(classifySupabaseError(error, "write"));
  return ok(null);
}

/**
 * 返済: お財布の残高と借入残高を減らす。
 * @returns 成功か、失敗の種類。失敗しても例外は投げない
 */
export async function bankRepay(
  userId: string,
  amount: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<BankOperationResult> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("bank_repay", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) return fail(classifySupabaseError(error, "write"));
  return ok(null);
}
