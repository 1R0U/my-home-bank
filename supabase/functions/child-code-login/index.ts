// メール送信せず、内部用のMagic Linkをその場で検証してセッションに交換する。
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleChildCodeLogin, type ChildSession } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

async function hash(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve((request) => {
  // 管理者と匿名クライアントを分離し、リクエスト間で子供のセッションを共有しない。
  // すべての外部要求を計45秒に制限し、DBの2分のログイン予約内で終了させる。
  const signal = AbortSignal.timeout(45_000);
  const options = { auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal }) } };
  const admin = createClient(url, serviceKey, options);
  const auth = createClient(url, anonKey, options);
  return handleChildCodeLogin(request, {
    async consumeCode(code, clientAddress) {
      const { data, error } = await admin.rpc("consume_child_login_code", {
        p_code_hash: await hash(code), p_client_hash: await hash(clientAddress),
      });
      if (error) throw error;
      return data.error ?? data;
    },
    async createSession(email) {
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (linkError) throw linkError;
      const { data, error } = await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
      if (error || !data.session) throw error ?? new Error("セッションがありません");
      const encoded = data.session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const { session_id } = JSON.parse(atob(encoded));
      if (typeof session_id !== "string") throw new Error("セッションIDがありません");
      return { access_token: data.session.access_token, refresh_token: data.session.refresh_token,
        userId: data.user!.id, sessionId: session_id } satisfies ChildSession;
    },
    async revokeOtherSessions(accessToken) {
      const { error } = await admin.auth.admin.signOut(accessToken, "others");
      if (error) throw error;
    },
    async finishLogin(claim, sessionId) {
      const { data, error } = await admin.rpc("finish_child_login", {
        p_child_id: claim.childId, p_attempt_id: claim.attemptId, p_session_id: sessionId,
      });
      if (error) throw error;
      return data === true;
    },
    async discardSession(accessToken) {
      const { error } = await admin.auth.admin.signOut(accessToken, "local");
      if (error) throw error;
    },
  });
});
