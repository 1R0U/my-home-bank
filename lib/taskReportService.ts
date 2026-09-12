import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskReport } from "../types";

/**
 * client引数が省略された場合、実クライアント（./supabase）を遅延読み込みする。
 * 単体テストからこのファイルを読み込んでも、実際に呼び出さない限り RN 依存の
 * 実クライアントは読み込まれない。
 */
async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}

export type CreateTaskReportInput = {
  reported_by: string;
  title: string;
  description: string;
};

/**
 * タスクとして発行されていない家事の自主報告をpending状態でSupabaseに保存する。
 * @param input - 報告内容（報告者ID、タイトル、説明）
 * @returns 作成された報告
 * @throws 保存に失敗した場合、日本語メッセージのエラー
 */
export async function createTaskReport(
  input: CreateTaskReportInput,
  client?: Pick<SupabaseClient, "from">,
): Promise<TaskReport> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("task_reports")
    .insert({ ...input, status: "pending" })
    .select("*")
    .single();

  if (error) throw new Error("タスクの報告に失敗しました。時間をおいて再度お試しください。");
  return data as TaskReport;
}
