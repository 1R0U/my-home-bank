import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreItemRequest } from "../types";

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

export type CreateStoreItemRequestInput = {
  requested_by: string;
  title: string;
  description: string;
  reason: string;
  image_url: string;
};

/**
 * 商品追加申請をpending状態でSupabaseに保存する。
 * @param input - 申請内容（申請者ID、商品名、詳細、理由、画像URL）
 * @returns 作成された申請
 * @throws 保存に失敗した場合、日本語メッセージのエラー
 */
export async function createStoreItemRequest(
  input: CreateStoreItemRequestInput,
  client?: Pick<SupabaseClient, "from">,
): Promise<StoreItemRequest> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("store_item_requests")
    .insert({ ...input, status: "pending" })
    .select("*")
    .single();

  if (error) throw new Error("商品追加の申請に失敗しました。時間をおいて再度お試しください。");
  return data as StoreItemRequest;
}

/**
 * Supabase から商品追加申請一覧を取得する。作成日時の新しい順にソートされる。
 * @returns 申請一覧（全ステータス）
 * @throws Supabase からのエラー
 */
export async function fetchStoreItemRequests(
  client?: Pick<SupabaseClient, "from">,
): Promise<StoreItemRequest[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("store_item_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as StoreItemRequest[];
}

/**
 * 商品追加申請を承認する。store_item_requests→store_items の作成を
 * 1トランザクションで行う（approve_store_item_request 関数）。
 * @param requestId - 承認する申請のID
 * @param approverId - 承認者（親）のユーザーID
 * @param price - 商品に設定するポイント数（1以上の整数）
 * @throws Supabase からのエラー（トランザクション失敗を含む）
 */
export async function approveStoreItemRequest(
  requestId: string,
  approverId: string,
  price: number,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("approve_store_item_request", {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_price: price,
  });

  if (error) throw error;
}

/**
 * 商品追加申請を拒否する。ストア商品は作成しない。
 * @param requestId - 拒否する申請のID
 * @param approverId - 拒否した（親）のユーザーID
 * @throws Supabase からのエラー
 */
export async function rejectStoreItemRequest(
  requestId: string,
  approverId: string,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<void> {
  const resolvedClient = await resolveClient(client);
  const { error } = await resolvedClient.rpc("reject_store_item_request", {
    p_request_id: requestId,
    p_approver_id: approverId,
  });

  if (error) throw error;
}
