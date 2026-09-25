import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { User } from "../types/index.ts";
import {
  type AuthClient,
  type AuthResult,
  ProfileMissingError,
  discardLocalSession,
  prepareRegisteredUser,
} from "./auth.ts";
import { mapAuthError } from "./authErrors.ts";
import { resolveClient } from "./supabaseClient.ts";

// OAuthのブラウザセッションがWeb版のリダイレクトを正しく閉じられるようにする
// （ネイティブでは何もしない、無害な呼び出し）。
WebBrowser.maybeCompleteAuthSession();

/**
 * Googleアカウントで認証し、家族設定済みのプロフィールを取得する（Issue #292）。
 *
 * Supabase AuthのGoogle OAuthをブラウザで開き、アプリの独自スキーム
 * （`my-home-bank://`）へ戻ってきたURLから認可コードを受け取ってセッション化する。
 * プロフィール作成（`public.users` 行の作成）自体はDBトリガー側の対応（Issue #291）
 * が前提で、ここでは `lib/auth.ts` の `prepareRegisteredUser` を使い回す。
 *
 * **expo-linking / expo-web-browser を使うため、このファイルは lib/auth.ts と分けてある。**
 * lib/auth.ts は plain Node（`node --test`）から直接テストされており、ネイティブ専用
 * モジュールの import だけでテストが落ちるため（詳細はlib/auth.tsの冒頭コメント）。
 */
export async function signInWithGoogle(client?: AuthClient): Promise<AuthResult<User>> {
  const resolvedClient = await resolveClient<AuthClient>(client);
  const redirectTo = Linking.createURL("auth/callback");

  const { data: oauthData, error: oauthError } = await resolvedClient.auth.signInWithOAuth({
    options: { redirectTo, skipBrowserRedirect: true },
    provider: "google",
  });

  if (oauthError || !oauthData.url) {
    return { data: null, error: mapAuthError(oauthError) };
  }

  const result = await WebBrowser.openAuthSessionAsync(oauthData.url, redirectTo);

  if (result.type === "cancel" || result.type === "dismiss") {
    return { data: null, error: "ログインがキャンセルされました。" };
  }
  if (result.type !== "success") {
    return { data: null, error: "Google認証に失敗しました。通信環境を確認して再度お試しください。" };
  }

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    return { data: null, error: "Google認証に失敗しました。時間をおいて再度お試しください。" };
  }

  const { data: sessionData, error: sessionError } =
    await resolvedClient.auth.exchangeCodeForSession(code);
  if (sessionError || !sessionData.user) {
    return { data: null, error: mapAuthError(sessionError) };
  }

  try {
    return { data: await prepareRegisteredUser(sessionData.user.id, resolvedClient), error: null };
  } catch (error) {
    if (error instanceof ProfileMissingError) await discardLocalSession(resolvedClient);
    return {
      data: null,
      error: error instanceof Error ? error.message : "ユーザー情報の取得に失敗しました。",
    };
  }
}
