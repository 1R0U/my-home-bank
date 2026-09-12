import type { SupabaseClient } from "@supabase/supabase-js";
import type { EconomyTransaction, GuildTreasury } from "../types";
import {
  assertMinimumReserveRate,
  assertPositiveSafeHmc,
  assertSafeHmc,
} from "./treasury.ts";

async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

function validateGuildTreasury(treasury: GuildTreasury): GuildTreasury {
  assertSafeHmc(treasury.balance, "ギルド金庫残高");
  assertSafeHmc(treasury.initial_supply, "初期供給量");
  assertSafeHmc(treasury.total_supply, "家庭総HMC");
  assertMinimumReserveRate(treasury.minimum_reserve_rate);
  if (treasury.balance > treasury.total_supply) {
    throw new Error("ギルド金庫残高が家庭総HMCを超えています");
  }
  return treasury;
}

export async function fetchGuildTreasury(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<GuildTreasury | null> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("guild_treasuries")
    .select("*")
    .eq("family_id", familyId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return null;
  return validateGuildTreasury(data as GuildTreasury);
}

export async function fetchEconomyTransactions(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<EconomyTransaction[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("economy_transactions")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as EconomyTransaction[] | null) ?? [];
}

export async function createFamilyWithTreasury(
  familyName: string,
  initialSupply: number,
  idempotencyKey: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<string> {
  assertPositiveSafeHmc(initialSupply, "初期供給量");
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("create_family_with_treasury", {
    p_family_name: familyName,
    p_initial_supply: initialSupply,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  return data as string;
}

export async function issueTreasuryHmc(
  amount: number,
  idempotencyKey: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<GuildTreasury> {
  assertPositiveSafeHmc(amount, "追加発行額");
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.rpc("issue_treasury_hmc", {
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  return validateGuildTreasury(data as GuildTreasury);
}
