/** Supabase の接続設定が入力済みか検証する。 */
export function resolveSupabaseConfig(
  url: string | undefined,
  anonKey: string | undefined,
): { url: string; anonKey: string } {
  if (!url || !anonKey) {
    throw new Error("Supabase env vars are missing. Copy .env.example to .env and fill in the values.");
  }

  if (url === "https://your-project-id.supabase.co" || anonKey === "your-anon-key-here") {
    throw new Error(".env の Supabase URL と公開キーを実際のプロジェクトの値に設定してください");
  }

  return { url, anonKey };
}
