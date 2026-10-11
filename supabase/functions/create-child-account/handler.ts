/**
 * 親が自分の家族へ子供アカウントを追加する Edge Function の本体（Issue #264）。
 *
 * Supabase への問い合わせは引数（`deps`）で受け取る。Deno 固有の処理は `index.ts` に
 * 置き、ここは Node のテスト（`tests/createChildAccountHandler.test.mjs`）から
 * そのまま読み込めるようにしている。
 *
 * 認可はDB側（`prepare_child_account`）が行う。ここでは親のJWTのままそれを呼び、
 * 通ったときだけ管理者権限で Auth アカウントを作る。`users` 行は Auth 登録のトリガーが
 * 同じトランザクションで作る。
 */

export type CreateChildAccountDeps = {
  /**
   * 呼び出し元のJWTで `prepare_child_account` を呼び、子供用の内部メールアドレスを得る。
   * 親でない・家族がないなどで拒否されたときは、DBのエラーメッセージを持つ Error を投げる。
   */
  prepareChildAccount: (authorization: string, name: string) => Promise<string>;
  /**
   * 管理者権限で、メール確認済みの Auth アカウントを作る。作ったアカウントのIDを返す。
   */
  createAuthUser: (email: string) => Promise<string>;
};

export const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    status,
  });
}

/**
 * リクエスト本文から子供の名前を取り出す。
 * 名前の長さなどの検証はDB側（`prepare_child_account`）が行う。
 * @param body - JSONとして読んだリクエスト本文
 * @returns 名前。文字列でなければ null
 */
function readName(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("name" in body)) return null;
  const { name } = body as { name: unknown };
  return typeof name === "string" ? name : null;
}

/**
 * 子供アカウントを作る。
 * @param request - 受け取ったリクエスト
 * @param deps - Supabase への問い合わせ
 * @returns 成功時は `{ userId }`、失敗時は `{ error }` を持つJSONのレスポンス
 */
export async function handleCreateChildAccount(
  request: Request,
  deps: CreateChildAccountDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "POSTで呼び出してください" });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return jsonResponse(401, { error: "ログインが必要です" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "リクエストの形式が正しくありません" });
  }
  const name = readName(body);
  if (name === null) {
    return jsonResponse(400, { error: "名前を入力してください" });
  }

  let email: string;
  try {
    email = await deps.prepareChildAccount(authorization, name);
  } catch (e) {
    // 親でない・家族がない・名前が不正など、DBが理由を付けて拒否したもの
    const message = e instanceof Error && e.message ? e.message : "子供アカウントを追加できませんでした";
    return jsonResponse(400, { error: message });
  }

  try {
    const userId = await deps.createAuthUser(email);
    return jsonResponse(200, { userId });
  } catch (e) {
    // 予約は10分で失効し、次の予約のときに片付くため、ここでは消さない
    console.error("子供のAuthアカウントを作成できませんでした", e);
    return jsonResponse(500, { error: "子供アカウントを作成できませんでした。時間をおいてもう一度お試しください" });
  }
}
