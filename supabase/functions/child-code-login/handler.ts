// Issue #264: コードを1回だけ消費して、既存の子供のAuthセッションへ交換する。
import { CORS_HEADERS } from "../create-child-account/handler.ts";

export type LoginClaim = { childId: string; email: string; attemptId: string };
export type ChildSession = { access_token: string; refresh_token: string; userId: string; sessionId: string };
export type ChildCodeLoginDeps = {
  consumeCode: (code: string, clientAddress: string) => Promise<LoginClaim | "invalid_code" | "rate_limited">;
  createSession: (email: string) => Promise<ChildSession>;
  revokeOtherSessions: (accessToken: string) => Promise<void>;
  finishLogin: (claim: LoginClaim, sessionId: string | null) => Promise<boolean>;
  completeLogin: (claim: LoginClaim) => Promise<void>;
  discardSession: (accessToken: string) => Promise<void>;
};

const INVALID_CODE = "コードが違うか、有効期限が切れています。親から新しいコードをもらってください";
/** SupabaseのCloudflare経由入口専用。XFFは利用者が先頭へ値を追加できるので使わない。 */
function clientAddress(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim().toLowerCase() ?? "";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
    && value.split(".").every((part) => Number(part) <= 255)) {
    return value.split(".").map(Number).join(".");
  }
  if (value.includes(":") && /^[0-9a-f:.]+$/.test(value)) {
    try { return new URL(`http://[${value}]`).hostname.slice(1, -1); } catch { /* 不正なIPv6 */ }
  }
  // 欠落・不正値は共通バケット。利用者入力の別ヘッダーへフォールバックしない。
  return "unknown";
}
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
    // CF-Connecting-IPを信頼する入口の条件と確認方法は docs/CHILD_LOGIN.md を参照。
    const consumed = await deps.consumeCode(code, clientAddress(request));
    if (consumed === "rate_limited") return json(429, { error: "試行回数が多すぎます。1分待ってからお試しください" });
    if (consumed === "invalid_code") return json(400, { error: INVALID_CODE });
    claim = consumed;
    session = await deps.createSession(claim.email);
    if (session.userId !== claim.childId) throw new Error("認証した子供が一致しません");
    // 先に復元可能なDBの仮切替をする。失敗時は旧Authセッションを失効させない。
    const staged = await deps.finishLogin(claim, session.sessionId);
    if (!staged) throw new Error("ログイン処理の有効期限が切れました");
    await deps.revokeOtherSessions(session.access_token);
    finished = true;
    // ここから先は新セッションを破棄しない。予約の後始末は失敗してもログインを成功させる。
    await deps.completeLogin(claim).catch(() => undefined);
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
