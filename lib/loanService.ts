import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan, LoanOffer, LoanRepayment } from "../types";
import { resolveClient } from "./supabaseClient.ts";

type FromClient = Pick<SupabaseClient, "from">;
type RpcClient = Pick<SupabaseClient, "rpc">;

export type FamilyBorrower = { id: string; name: string };

export async function fetchFamilyBorrowers(familyId: string, client?: FromClient): Promise<FamilyBorrower[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("users")
    .select("id, name")
    .eq("family_id", familyId)
    .eq("role", "child")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FamilyBorrower[];
}

export async function fetchLoans(client?: FromClient): Promise<Loan[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("loans")
    .select("*")
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Loan[];
}

export async function fetchLoanRepayments(loanId: string, client?: FromClient): Promise<LoanRepayment[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("loan_repayments")
    .select("*")
    .eq("loan_id", loanId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoanRepayment[];
}

export async function fetchLoanOffer(borrowerId: string, client?: RpcClient): Promise<LoanOffer> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("get_loan_offer", {
    p_borrower_id: borrowerId,
  });
  if (error) throw error;
  const offer = Array.isArray(data) ? data[0] : data;
  if (!offer) throw new Error("ローン設定が見つかりません");
  return offer as LoanOffer;
}

export async function requestLoan(
  borrowerId: string,
  amount: number,
  purpose: string,
  monthlyInterestRate: number,
  termDays: number,
  idempotencyKey: string,
  client?: RpcClient,
): Promise<string> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("request_loan", {
    p_borrower_id: borrowerId,
    p_amount: amount,
    p_purpose: purpose.trim(),
    p_monthly_interest_rate: monthlyInterestRate,
    p_term_days: termDays,
    p_idempotency_key: idempotencyKey.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function approveLoan(loanId: string, approverId: string, client?: RpcClient): Promise<string> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("approve_loan", {
    p_loan_id: loanId,
    p_approver_id: approverId,
  });
  if (error) throw error;
  return data as string;
}

export async function rejectLoan(loanId: string, approverId: string, client?: RpcClient): Promise<string> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("reject_loan", {
    p_loan_id: loanId,
    p_approver_id: approverId,
  });
  if (error) throw error;
  return data as string;
}

export async function repayLoan(
  loanId: string,
  borrowerId: string,
  amount: number,
  idempotencyKey: string,
  client?: RpcClient,
): Promise<string> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("repay_loan", {
    p_loan_id: loanId,
    p_borrower_id: borrowerId,
    p_amount: amount,
    p_idempotency_key: idempotencyKey.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function updateLoanSettings(
  borrowerId: string,
  loanLimit: number,
  monthlyInterestRate: number,
  termDays: number,
  client?: RpcClient,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("update_loan_settings", {
    p_borrower_id: borrowerId,
    p_loan_limit: loanLimit,
    p_monthly_interest_rate: monthlyInterestRate,
    p_term_days: termDays,
  });
  if (error) throw error;
}
