import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";
import { assertPositiveSafeGol, assertSafeGol } from "./treasury.ts";

export type SavingsRun = {
  target_month: string;
  kind: "transfer" | "interest";
  requested_amount: number;
  amount: number;
  status: "completed" | "partial" | "empty" | "stopped" | "reserve" | "rounded_zero";
};
export type SavingsAccountSummary = {
  user_id: string;
  name: string;
  balance: number;
  monthly_amount: number;
  next_transfer_date: string | null;
  estimated_interest: number;
  history: SavingsRun[];
};
export type SavingsSummary = {
  transfer_day: number;
  monthly_rate: number;
  accounts: SavingsAccountSummary[];
};
type Client = Pick<SupabaseClient, "rpc">;

async function rpc(name: string, args: Record<string, unknown>, client?: Client) {
  const resolved = await resolveClient(client);
  const { data, error } = await resolved.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function fetchSavingsSummary(client?: Client): Promise<SavingsSummary> {
  const data = await rpc("get_savings_summary", {}, client);
  if (!data || !Array.isArray(data.accounts)) throw new Error("積立預金を取得できませんでした");
  return data;
}
export async function setSavingsAmount(amount: number, client?: Client): Promise<void> {
  assertSafeGol(amount, "積立額");
  await rpc("set_savings_amount", { p_amount: amount }, client);
}
export async function setSavingsDay(day: number, client?: Client): Promise<void> {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("積立日は1〜31で指定してください");
  await rpc("set_savings_day", { p_day: day }, client);
}
export async function withdrawSavings(amount: number, key: string, client?: Client): Promise<void> {
  assertPositiveSafeGol(amount, "引き出し額");
  if (!key.trim() || key.trim().length > 100) throw new Error("操作キーが不正です");
  await rpc("withdraw_savings", { p_amount: amount, p_key: key.trim() }, client);
}
