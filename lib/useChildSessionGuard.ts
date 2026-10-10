import { useEffect } from "react";
import { AppState } from "react-native";
import { discardLocalSession } from "./auth";
import { isChildSessionRevoked } from "./childLoginService";
import { useAppStore } from "../store";
import { supabase } from "./supabase";

/** 別の端末で入り直した子供を、通信断と区別してログイン画面へ戻す。 */
export function useChildSessionGuard() {
  const user = useAppStore((state) => state.user);
  useEffect(() => {
    if (user?.role !== "child") return;
    let stopped = false;
    let checking = false;
    const check = async () => {
      if (stopped || checking || AppState.currentState === "background") return;
      checking = true;
      try {
        // 遅い失効応答で、その後ログインした新しいセッションを消さない。
        const before = await supabase.auth.getSession();
        if (await isChildSessionRevoked(supabase)) {
          const after = await supabase.auth.getSession();
          if (!stopped && before.data.session?.access_token === after.data.session?.access_token) {
            await discardLocalSession(supabase);
            if (!stopped) useAppStore.getState().setUser(null);
          }
        }
      } catch { /* 通信断だけではログアウトしない */ }
      finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 30_000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => { stopped = true; clearInterval(timer); subscription.remove(); };
  }, [user]);
}
