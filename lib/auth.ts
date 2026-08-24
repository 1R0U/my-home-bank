import { mapAuthError } from "./authErrors";
import { supabase } from "./supabase";
import type { User, UserRole } from "../types";

export type AuthResult<T> = { data: T; error: null } | { data: null; error: string };

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export async function signUpWithEmail({
  name,
  email,
  password,
  role,
}: SignUpInput): Promise<AuthResult<User>> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }

  const user: User = {
    id: authData.user.id,
    name: name.trim(),
    role,
    balance: 0,
    created_at: authData.user.created_at,
  };

  const { error: insertError } = await supabase.from("users").insert({
    id: user.id,
    name: user.name,
    role: user.role,
    balance: user.balance,
  });

  if (insertError) {
    return {
      data: null,
      error: "ユーザー情報の保存に失敗しました。時間をおいて再度お試しください。",
    };
  }

  return { data: user, error: null };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult<User>> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, name, role, balance, created_at")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    return { data: null, error: "ユーザー情報の取得に失敗しました。" };
  }

  return { data: profile as User, error: null };
}
