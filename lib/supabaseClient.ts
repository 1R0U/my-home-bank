/**
 * Supabase クライアントを解決するための共通処理（Issue #217）。
 *
 * 各サービス（`taskService` / `bankService` など）は、テストからモックを差し込めるよう
 * クライアントを任意の引数で受け取る。省略されたときだけ実クライアントを読み込む。
 *
 * **実クライアントの読み込みを遅延させているのは意図的。** `./supabase` は
 * 読み込んだ時点で環境変数を検証して例外を投げるため、静的に import すると
 * `.env` が無い環境（純粋なロジックのテストなど）でサービスを読み込めなくなる。
 *
 * 以前は同じ関数が6つのサービスへ1バイトも違わずコピーされていた。
 */

/**
 * 渡されたクライアントがあればそれを、無ければ実クライアントを返す。
 * @param client - 差し替え用のクライアント。テスト以外では省略する
 * @returns 使用するクライアント
 */
export async function resolveClient<T>(client: T | undefined): Promise<T> {
  if (client) return client;
  const { supabase } = await import("./supabase");
  return supabase as unknown as T;
}
