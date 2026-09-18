import type { SupabaseClient } from "@supabase/supabase-js";
import { getGuestUser } from "./guestUsers.ts";
import { isUuid } from "./uuid.ts";
import type { User, UserRole } from "../types";
import { resolveClient } from "./supabaseClient.ts";

/**
 * 現在の残高を取得する（承認・購入などの操作後に画面表示を最新化するため）。
 * @param userId - 対象ユーザーのid
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能。省略時は実クライアントを遅延読み込みする）
 */
export async function fetchUserBalance(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<number> {
  const resolvedClient = await resolveClient(client);

  const { data, error } = await resolvedClient
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return (data as { balance: number }).balance;
}

/**
 * 所属する家族のidを取得する（ギルド金庫残高の表示に使う。Issue #233）。
 * 家族に未所属の場合はもちろん、`users` に該当行が無い場合も null を返す
 * （DBを作り直した後など、ストアに古いユーザーが残っているケースを
 * エラー扱いにしないため。`fetchGuildTreasury` / `ensureDbUser` と同じ `maybeSingle()`）。
 * @param userId - 対象ユーザーのid
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能。省略時は実クライアントを遅延読み込みする）
 */
export async function fetchUserFamilyId(
  userId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<string | null> {
  const resolvedClient = await resolveClient(client);

  const { data, error } = await resolvedClient
    .from("users")
    .select("family_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data === null ? null : (data as { family_id: string | null }).family_id;
}

export type CreateUserProfileInput = {
  name: string;
  role: UserRole;
};

/**
 * 初期設定（オンボーディング）で家族メンバーのプロフィールを新規作成する。
 * usersテーブルに実際の行を作成し、本物のidを持つUserを返す。
 * 所持金は0円で作成される。
 * @param input - 名前・役割
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能）
 */
export async function createUserProfile(
  input: CreateUserProfileInput,
  client?: Pick<SupabaseClient, "from">,
): Promise<User> {
  const resolvedClient = await resolveClient(client);

  const { data, error } = await resolvedClient
    .from("users")
    .insert({ name: input.name, role: input.role, balance: 0 })
    .select("*")
    .single();

  if (error) throw error;
  return data as User;
}

/**
 * 非UUIDのモックユーザーを、DBにseed済みの固定ゲストユーザーへ解決する。
 * 固定UUIDの行を使うため、同時呼び出しでもusers行が増えない。
 */
export async function ensureDbUser(
  user: User,
  client?: Pick<SupabaseClient, "from">,
): Promise<User> {
  if (isUuid(user.id)) return user;

  const guest = getGuestUser(user.role);
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("users")
    .select("*")
    .eq("id", guest.id)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.role !== user.role) {
    throw new Error(`${user.role}用のゲストユーザーがDBに存在しません`);
  }
  return data as User;
}
