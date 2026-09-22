import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { restoreAuthSession } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../store";
import "../global.css";

export default function RootLayout() {
  const setUser = useAppStore((state) => state.setUser);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    restoreAuthSession()
      .then((result) => {
        if (!mounted) return;
        setUser(result.user);
        if (result.error) console.warn(result.error);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setUser(null);
        console.warn(
          error instanceof Error ? error.message : "ログイン状態の復元に失敗しました。",
        );
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && mounted) {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [setUser]);

  if (!authReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center bg-slate-100">
          <ActivityIndicator accessibilityLabel="ログイン状態を確認中" color="#2563eb" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* (adult) はTabsレイアウトを持つルートグループ。ここでheaderShownを
            明示しないと、グループ全体に対する素のネイティブヘッダーが表示されてしまう。 */}
        <Stack.Screen name="(adult)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
