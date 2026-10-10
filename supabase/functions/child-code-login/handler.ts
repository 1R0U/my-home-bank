// Issue #264: コードを1回だけ消費して、既存の子供のAuthセッションへ交換する。
import { CORS_HEADERS } from "../create-child-account/handler.ts";

export type LoginClaim = { childId: string; email: string; attemptId: string };
export type ChildSession = { access_token: string; refresh_token: string; userId: string; sessionId: string };
export type ChildCodeLoginDeps = {
  consumeCode: (code: string, clientAddress: string) => Promise<LoginClaim | "invalid_code" | "rate_limited">;
  createSession: (email: string) => Promise<ChildSession>;
  revokeOtherSessions: (accessToken: string) => Promise<void>;
  finishLogin: (claim: LoginClaim, sessionId: string | null) => Promise<boolean>;
  discardSession: (accessToken: string) => Promise<void>;
};

const INVALID_CODE = "コードが違うか、有効期限が切れています。親から新しいコードをもらってください";
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: {
    ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store",
  } });
}

export async function handleChildCodeLogin(request: Request, deps: ChildCodeLoginDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { error: "POSTで呼び出してください" });
  let code: string;
  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch { return json(400, { error: INVALID_CODE }); }
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return json(400, { error: INVALID_CODE });

  let claim: LoginClaim | undefined;
  let session: ChildSession | undefined;
  let finished = false;
  try {
    // IPだけに依存しない全体上限もDB側で検査する。IPはハッシュ化して保存する。
    const consumed = await deps.consumeCode(code, request.headers.get("x-forwarded-for") ?? "unknown");
    if (consumed === "rate_limited") return json(429, { error: "試行回数が多すぎます。1分待ってからお試しください" });
    if (consumed === "invalid_code") return json(400, { error: INVALID_CODE });
    claim = consumed;
    session = await deps.createSession(claim.email);
    if (session.userId !== claim.childId) throw new Error("認証した子供が一致しません");
    // Refresh Tokenの失効と、DB側での古いJWT拒否は別々に必要。
    await deps.revokeOtherSessions(session.access_token);
    finished = await deps.finishLogin(claim, session.sessionId);
    if (!finished) throw new Error("ログイン処理の有効期限が切れました");
    return json(200, { access_token: session.access_token, refresh_token: session.refresh_token, userId: claim.childId });
  } catch {
    // コード・内部メール・セッションをログへ出さない。失敗したコードは再利用させない。
    return json(500, { error: "ログインできませんでした。親から新しいコードをもらってください" });
  } finally {
    if (!finished) {
      if (session) await deps.discardSession(session.access_token).catch(() => undefined);
      if (claim) await deps.finishLogin(claim, null).catch(() => undefined);
    }
  }
}
