import { Redirect } from "expo-router";

/**
 * GoogleログインのOAuthコールバック先（Issue #292）。
 *
 * iOS（`ASWebAuthenticationSession`）はブラウザセッション内でリダイレクト先を
 * 受け取るだけで、このルートへは遷移しない。一方 Android（Custom Tabs）は
 * `my-home-bank://auth/callback` を通常のディープリンクとしてアプリへ渡すため、
 * Expo Router がこのパスへ遷移しようとする。対応するルートが無いと
 * 「Unmatched Route」画面になってしまうため、何もせず `/` へ戻すだけの
 * ルートを用意する（`lib/googleAuth.ts` がコード交換とログイン処理そのものは
 * 別途 `WebBrowser.openAuthSessionAsync` の戻り値から行っている）。
 */
export default function AuthCallbackScreen() {
  return <Redirect href="/" />;
}
