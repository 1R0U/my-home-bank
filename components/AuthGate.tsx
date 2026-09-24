import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { shouldRedirectToLogin } from "../lib/authGuard";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { useAppStore } from "../store";

/**
 * 未ログインでログインが要る画面にいたら、ログイン画面へ送り返す（Issue #274）。
 *
 * ルートの layout に1つだけ置く。セッションが切れて `user` が null になったときも、
 * 未ログインで URL から直接入ったときも、同じここで扱う。
 * 何も描画しない。
 */
export default function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const isLoggedIn = useAppStore((state) => state.user !== null);
  // ナビゲーションの準備ができる前に遷移すると Expo Router がエラーにするため、待つ
  const navigationReady = Boolean(useRootNavigationState()?.key);

  useEffect(() => {
    if (!navigationReady) return;
    if (shouldRedirectToLogin(segments, isLoggedIn, DEV_ROLE_OVERRIDE !== undefined)) {
      router.replace("/login");
    }
  }, [isLoggedIn, navigationReady, router, segments]);

  return null;
}
