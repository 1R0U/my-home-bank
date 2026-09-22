import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "../types/index.ts";
import { isAlreadyRegisteredAuthError, mapAuthError } from "./authErrors.ts";
import { resolveClient } from "./supabaseClient.ts";
import { createFamilyWithTreasury } from "./treasuryService.ts";

type AuthClient = Pick<SupabaseClient, "auth" | "from" | "rpc">;

const USER_PROFILE_COLUMNS = "id, family_id, name, role, balance, created_at";
export const INITIAL_FAMILY_SUPPLY = 10_000;

export type AuthResult<T> = { data: T; error: null } | { data: null; error: string };

export type SignUpInput = {
  email: string;
  name: string;
  password: string;
};

export type SignUpData =
  | { emailConfirmationRequired: true; user: null }
  | { emailConfirmationRequired: false; user: User };

export type SessionRestoreResult = {
  error: string | null;
  user: User | null;
};

async function fetchUserProfile(userId: string, client: AuthClient): Promise<User> {
  const { data, error } = await client
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }
  return data as User;
}

async function prepareRegisteredUser(userId: string, client: AuthClient): Promise<User> {
  const profile = await fetchUserProfile(userId, client);
  if (profile.family_id) return profile;

  if (profile.role !== "parent") {
    throw new Error("所属する家族が設定されていません。");
  }

  await createFamilyWithTreasury(
    `${profile.name}の家族`,
    INITIAL_FAMILY_SUPPLY,
    `auth-registration:${profile.id}`,
    client,
  );
  return fetchUserProfile(userId, client);
}

async function discardLocalSession(client: AuthClient): Promise<void> {
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

/** Supabase Authへ登録する。公開登録は、新しい家族を作成する親だけを対象にする。 */
export async function signUpWithEmail(
  input: SignUpInput,
  client?: AuthClient,
): Promise<AuthResult<SignUpData>> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const email = input.email.trim();
  const name = input.name.trim();
  const { data: authData, error: authError } = await resolvedClient.auth.signUp({
    email,
    options: { data: { name, role: "parent" } },
    password: input.password,
  });

  if (isAlreadyRegisteredAuthError(authError)) {
    // 登録済みかどうかを画面の応答から判別できないよう、確認待ちと同じ結果にする。
    return {
      data: { emailConfirmationRequired: true, user: null },
      error: null,
    };
  }

  if (authError || !authData.user) {
    return { data: null, error: mapAuthError(authError) };
  }

  if (!authData.session) {
    return {
      data: { emailConfirmationRequired: true, user: null },
      error: null,
    };
  }

  try {
    const profile = await prepareRegisteredUser(authData.user.id, resolvedClient);
    return {
      data: { emailConfirmationRequired: false, user: profile },
      error: null,
    };
  } catch {
    await discardLocalSession(resolvedClient);
    return { data: null, error: "家族の初期設定に失敗しました。再度ログインしてください。" };
  }
}

/** メールアドレスとパスワードで認証し、家族設定済みのプロフィールを取得する。 */
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

  try {
    return { data: await prepareRegisteredUser(authData.user.id, resolvedClient), error: null };
  } catch (error) {
    await discardLocalSession(resolvedClient);
    return {
      data: null,
      error: error instanceof Error ? error.message : "ユーザー情報の取得に失敗しました。",
    };
  }
}

/** 保存済みのSupabaseセッションから利用者プロフィールを復元する。 */
export async function restoreAuthSession(client?: AuthClient): Promise<SessionRestoreResult> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const { data, error } = await resolvedClient.auth.getSession();
  if (error) {
    return { error: "ログイン状態の復元に失敗しました。", user: null };
  }
  if (!data.session?.user) {
    return { error: null, user: null };
  }

  try {
    return {
      error: null,
      user: await prepareRegisteredUser(data.session.user.id, resolvedClient),
    };
  } catch (profileError) {
    await discardLocalSession(resolvedClient);
    return {
      error:
        profileError instanceof Error
          ? profileError.message
          : "ユーザー情報の取得に失敗しました。",
      user: null,
    };
  }
}

/** 現在のSupabaseセッションを破棄する。 */
export async function signOutCurrentUser(client?: AuthClient): Promise<string | null> {
  try {
    const resolvedClient = await resolveClient<AuthClient>(client);
    const { error } = await resolvedClient.auth.signOut();
    return error ? "ログアウトに失敗しました。時間をおいて再度お試しください。" : null;
  } catch {
    return "ログアウトに失敗しました。時間をおいて再度お試しください。";
  }
}
