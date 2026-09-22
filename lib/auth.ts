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

export type SignUpData = {
  emailConfirmationRequired: boolean;
  user: User;
};

/** Supabase Authへ登録する。usersプロフィールはDBトリガーが同じトランザクションで作成する。 */
export async function signUpWithEmail(
  input: SignUpInput,
  client?: AuthClient,
): Promise<AuthResult<SignUpData>> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const email = input.email.trim();
  const name = input.name.trim();
  const { data: authData, error: authError } = await resolvedClient.auth.signUp({
    email,
    options: { data: { name, role: input.role } },
    password: input.password,
  });

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }

  const profile: User = {
    balance: 0,
    created_at: authData.user.created_at,
    family_id: null,
    id: authData.user.id,
    name,
    role: input.role,
  };
  return {
    data: {
      emailConfirmationRequired: authData.session === null,
      user: profile,
    },
    error: null,
  };
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
    // Authだけログイン済みの中途半端な状態を端末へ残さない。
    await resolvedClient.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { data: null, error: "ユーザー情報の取得に失敗しました。" };
  }

  return { data: profile as User, error: null };
}
