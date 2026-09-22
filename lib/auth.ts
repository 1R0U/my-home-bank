import type { SupabaseClient } from "@supabase/supabase-js";
import type { User, UserRole } from "../types/index.ts";
import { mapAuthError } from "./authErrors.ts";
import { resolveClient } from "./supabaseClient.ts";

type AuthClient = Pick<SupabaseClient, "auth" | "from">;

export type AuthResult<T> = { data: T; error: null } | { data: null; error: string };

export type SignUpInput = {
  email: string;
  name: string;
  password: string;
  role: UserRole;
};

/** Supabase Authへ登録し、同じIDでusersプロフィールを作成する。 */
export async function signUpWithEmail(
  input: SignUpInput,
  client?: AuthClient,
): Promise<AuthResult<User>> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const email = input.email.trim();
  const name = input.name.trim();
  const { data: authData, error: authError } = await resolvedClient.auth.signUp({
    email,
    password: input.password,
  });

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }
  // メール確認が有効なSupabaseでは、登録済みメールでも情報漏えい防止のため
  // エラーではなく identities が空のユーザーを返す場合がある。
  if (authData.user.identities?.length === 0) {
    return { data: null, error: "このメールアドレスは既に登録されています。" };
  }

  const profile: User = {
    balance: 0,
    created_at: authData.user.created_at,
    family_id: null,
    id: authData.user.id,
    name,
    role: input.role,
  };
  const { error: profileError } = await resolvedClient.from("users").insert({
    balance: profile.balance,
    id: profile.id,
    name: profile.name,
    role: profile.role,
  });

  if (profileError) {
    return {
      data: null,
      error: "ユーザー情報の保存に失敗しました。時間をおいて再度お試しください。",
    };
  }

  return { data: profile, error: null };
}

/** メールアドレスとパスワードで認証し、アプリ用プロフィールを取得する。 */
export async function signInWithEmail(
  email: string,
  password: string,
  client?: AuthClient,
): Promise<AuthResult<User>> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const { data: authData, error: authError } = await resolvedClient.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }

  const { data: profile, error: profileError } = await resolvedClient
    .from("users")
    .select("id, family_id, name, role, balance, created_at")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    return { data: null, error: "ユーザー情報の取得に失敗しました。" };
  }

  return { data: profile as User, error: null };
}
