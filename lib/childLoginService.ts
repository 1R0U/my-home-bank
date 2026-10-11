import type { SupabaseClient } from "@supabase/supabase-js";
import { discardLocalSession, prepareRegisteredUser } from "./auth.ts";
import { resolveClient } from "./supabaseClient.ts";
import type { User } from "../types/index.ts";

export type ChildLoginCode = { code: string; expiresAt: string };
const FAILURE = "ログインできませんでした。親から新しいコードをもらってください";

export function normalizeChildLoginCode(code: string): string { return code.trim().toUpperCase(); }
export function isChildLoginCode(code: string): boolean { return /^[A-HJ-NP-Z2-9]{8}$/.test(normalizeChildLoginCode(code)); }

/** 同じ家族の親だけが発行できる。再発行すると以前の未使用コードも失効する。 */
export async function issueChildLoginCode(childId: string, client?: Pick<SupabaseClient, "rpc">): Promise<ChildLoginCode> {
  const resolved = await resolveClient(client);
  const { data, error } = await resolved.rpc("issue_child_login_code", { p_child_id: childId });
  if (error) throw new Error(error.message || "コードを発行できませんでした");
  if (!data || !isChildLoginCode(data.code ?? "") || !Number.isFinite(Date.parse(data.expiresAt))) {
    throw new Error("コードを発行できませんでした");
  }
  return data as ChildLoginCode;
}

/** 管理者キーやパスワードをアプリに持たせず、内部メールを画面へ出さずに子供セッションを保存する。 */
export async function signInWithChildCode(code: string, client?: Pick<SupabaseClient, "functions" | "auth" | "from" | "rpc">): Promise<User> {
  if (!isChildLoginCode(code)) throw new Error("親からもらった8文字のコードを入力してください");
  const resolved = await resolveClient(client);
  const { data, error } = await resolved.functions.invoke("child-code-login", { body: { code: normalizeChildLoginCode(code) } });
  if (error) {
    let message = FAILURE;
    try {
      const body = await error.context?.json();
      if (typeof body?.error === "string" && body.error) message = body.error;
    } catch { /* 通信エラーやJSON以外の本文は既定の文言にする */ }
    throw new Error(message);
  }
  if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string" || typeof data?.userId !== "string") {
    throw new Error(FAILURE);
  }
  const { data: session, error: sessionError } = await resolved.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (sessionError || session.user?.id !== data.userId) {
    await discardLocalSession(resolved);
    throw new Error(FAILURE);
  }
  try {
    const profile = await prepareRegisteredUser(data.userId, resolved);
    if (profile.role !== "child") throw new Error(FAILURE);
    return profile;
  } catch (cause) {
    await discardLocalSession(resolved);
    throw cause;
  }
}

/** 通信断ではログアウトさせず、サーバーが明示した失効だけを扱う。 */
export async function isChildSessionRevoked(client?: Pick<SupabaseClient, "rpc">): Promise<boolean> {
  const resolved = await resolveClient(client);
  const { data, error } = await resolved.rpc("current_child_session_is_valid");
  return error?.code === "PT401" || (!error && data === false);
}
