import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreItemRequest } from "../types";
import { resolveClient } from "./supabaseClient.ts";

export type CreateStoreItemRequestInput = {
  family_id: string;
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
 * Supabase から「承認待ち（pending）」の商品追加申請一覧を取得する。
 * 作成日時の新しい順にソートされる。
 * 画面側で使うのは pending のみで、承認済み/拒否済みの履歴は
 * ファミリーの利用期間に応じて無制限に増えるため、サーバー側で絞って取得する。
 * @returns pending の申請一覧
 * @throws 取得に失敗した場合、日本語メッセージのエラー
 */
export async function fetchStoreItemRequests(
  client?: Pick<SupabaseClient, "from">,
): Promise<StoreItemRequest[]> {
  const resolvedClient = await resolveClient(client);
  const { data, error } = await resolvedClient
    .from("store_item_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // createStoreItemRequest と同じ方針。生のSupabaseエラー（英語・技術的な内容）を
  // 親の画面にそのまま出さない。
  if (error) throw new Error("商品追加申請の取得に失敗しました。時間をおいて再度お試しください。");
  return (data ?? []) as StoreItemRequest[];
}

/**
 * approve_store_item_request / reject_store_item_request（DB関数）のエラーを、
 * 親の画面に出しても分かる日本語メッセージへ変換する。
 *
 * 「対象の申請が pending でない」は、親が2人いて片方が先に処理した直後にもう片方が
 * ボタンを押すと**普通に起きる**ケースで、異常系ではない（行ロック＋status検証が
 * 正しく効いている証拠でもある）。それ以外は想定外のエラーとして汎用メッセージにする。
 * @param error - Supabase / DB関数から返ったエラー
 * @param action - どの操作で起きたか（メッセージの文言に使う）
 * @returns 画面にそのまま出せる日本語のエラー
 */
function toRequestActionError(error: unknown, action: "承認" | "拒否"): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not found or not pending")) {
    return new Error("この申請はすでに処理されています。一覧を更新してください。");
  }
  return new Error(`申請の${action}に失敗しました。時間をおいて再度お試しください。`);
}

/**
 * 商品追加申請を承認する。store_item_requests→store_items の作成を
 * 1トランザクションで行う（approve_store_item_request 関数）。
 * @param requestId - 承認する申請のID
 * @param approverId - 承認者（親）のユーザーID
 * @param price - 商品に設定するポイント数（1以上の整数）
 * @throws 失敗した場合、日本語メッセージのエラー（他の親が先に処理済みの場合を含む）
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

  if (error) throw toRequestActionError(error, "承認");
}

/**
 * 商品追加申請を拒否する。ストア商品は作成しない。
 * @param requestId - 拒否する申請のID
 * @param approverId - 拒否した（親）のユーザーID
 * @throws 失敗した場合、日本語メッセージのエラー（他の親が先に処理済みの場合を含む）
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

  if (error) throw toRequestActionError(error, "拒否");
}
