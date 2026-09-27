import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

/** 子供の名前の上限（DBの `prepare_child_account` と同じ） */
export const CHILD_NAME_MAX_LENGTH = 50;

/** 家族の子供（設定画面の一覧に出す分だけ） */
export type FamilyChild = {
  id: string;
  name: string;
};

/**
 * 子供を追加するフォームの入力を検証する。
 * @param draft - 入力中の名前
 * @returns 前後の空白を除いた名前、エラー文言、追加できるか
 */
export function getChildNameDraftState(draft: string): {
  canSubmit: boolean;
  error: string | null;
  trimmed: string;
} {
  const trimmed = draft.trim();
  if (trimmed.length > CHILD_NAME_MAX_LENGTH) {
    return { canSubmit: false, error: `名前は${CHILD_NAME_MAX_LENGTH}文字以内で入力してください`, trimmed };
  }
  return { canSubmit: trimmed.length > 0, error: null, trimmed };
}

/**
 * Edge Function が返したエラーから、画面に出す理由を取り出す。
 *
 * supabase-js は200以外を `FunctionsHttpError` にし、本文は `context`（Response）に残す。
 * 本文の `error` に Edge Function / DB が付けた理由が入っている。
 */
async function readFunctionError(error: unknown): Promise<string> {
  const fallback = "子供アカウントを追加できませんでした";
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error) return body.error;
    } catch {
      // 本文がJSONでなければ既定の文言にする
    }
  }
  return fallback;
}

/**
 * 親が自分の家族へ子供アカウントを追加する（Issue #264）。
 *
 * Authアカウントの作成には管理者権限が要るため、Edge Function（`create-child-account`）を
 * 呼ぶ。親かどうか・家族があるかはDBが確かめる。
 * @param name - 子供の名前
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能。省略時は実クライアントを遅延読み込みする）
 * @returns 作った子供のユーザーID
 */
export async function createChildAccount(
  name: string,
  client?: Pick<SupabaseClient, "functions">,
): Promise<string> {
  const { canSubmit, error: draftError, trimmed } = getChildNameDraftState(name);
  if (!canSubmit) throw new Error(draftError ?? "名前を入力してください");

  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient.functions.invoke("create-child-account", {
    body: { name: trimmed },
  });

  if (error) throw new Error(await readFunctionError(error));
  const userId = (data as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string") throw new Error("子供アカウントを追加できませんでした");
  return userId;
}

/**
 * 家族の子供を、追加した順に取得する。
 * 同じ家族の `users` はRLS（`users_select_family`）で読める。
 * @param familyId - 家族のid
 * @param client - Supabaseクライアント（テスト時にモックを差し替え可能。省略時は実クライアントを遅延読み込みする）
 */
export async function fetchFamilyChildren(
  familyId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<FamilyChild[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("users")
    .select("id, name")
    .eq("family_id", familyId)
    .eq("role", "child")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FamilyChild[];
}
