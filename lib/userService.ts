import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./uuid.ts";
import type { User, UserRole } from "../types";

async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

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

type UserIdStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

/**
 * モックユーザーのDBプロフィールを端末に記録し、次回のタスク作成でも同じIDを使う。
 * 保存済みの行が削除されていれば作り直す。
 */
export async function ensureDbUser(
  user: User,
  client?: Pick<SupabaseClient, "from">,
  storage?: UserIdStorage,
): Promise<User> {
  if (isUuid(user.id)) return user;

  const resolvedClient = await resolveClient(client);
  const resolvedStorage = storage ?? (await import("@react-native-async-storage/async-storage")).default;
  const storageKey = `my-home-bank:db-user:${user.id}`;
  const savedId = await resolvedStorage.getItem(storageKey);

  if (isUuid(savedId)) {
    const { data, error } = await resolvedClient
      .from("users")
      .select("*")
      .eq("id", savedId)
      .maybeSingle();
    if (error) throw error;
    if (data && data.role === user.role) return data as User;
  }

  const created = await createUserProfile({ name: user.name, role: user.role }, resolvedClient);
  await resolvedStorage.setItem(storageKey, created.id);
  return created;
}
