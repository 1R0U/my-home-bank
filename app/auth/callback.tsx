import { useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * GoogleログインのOAuthコールバック先（Issue #292）。
 *
 * iOS（`ASWebAuthenticationSession`）はブラウザセッション内でリダイレクト先を
 * 受け取るだけで、このルートへは遷移しない。一方 Android（Custom Tabs）は
 * `my-home-bank://auth/callback` を通常のディープリンクとしてアプリへ渡すため、
 * Expo Router がこのパスへ遷移しようとする。対応するルートが無いと
 * 「Unmatched Route」画面になってしまうため、元のログイン画面へ戻すだけの
 * ルートを用意する（`lib/googleAuth.ts` がコード交換とログイン処理そのものは
 * 別途 `WebBrowser.openAuthSessionAsync` の戻り値から行っている）。
 *
 * **`/` への Redirect にはしない（1R0Uレビュー対応）。** ここに来るのはまだ
 * ログインの途中（未ログイン）のタイミングなので、`/` は未ログインなら
 * `/title` へ振り分ける。ログイン成功時は `handleGoogleLogin` の
 * `dismissAll()` で片付くが、失敗・キャンセル時はタイトル画面がログイン画面の
 * 上に積まれてしまい、ログイン画面のエラーメッセージが見えなくなる。
 * 戻れるなら戻る（ログイン画面に戻る）、戻れなければ `/` へ、とする。
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  return null;
}
