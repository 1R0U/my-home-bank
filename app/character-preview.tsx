// キャラクターの見た目（ねこ・ハムスター等）を、ログイン・DB保存を経由せず実機で
// 目視確認するためだけの一時的な画面（Issue #287）。
//
// **確認が終わったら、このファイルと app/login.tsx の確認用リンクを削除すること。**
import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RpgHubWebView,
  type RpgHubWebHandle,
} from "../components/rpg-hub-web/RpgHubWebView";
import {
  CHARACTER_TYPES,
  CHARACTER_TYPE_LABELS,
  type CharacterType,
} from "../lib/rpg-hub/characterTypes";
import type { RpgHubEvent } from "../lib/rpg-hub/bridge";

export default function CharacterPreviewScreen() {
  const [characterType, setCharacterType] = useState<CharacterType>("frog");
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<RpgHubWebHandle>(null);

  const handleEvent = (event: RpgHubEvent) => {
    if (event.event === "error") setError(event.message);
  };

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1">
        <RpgHubWebView
          key={characterType}
          ref={webViewRef}
          characterType={characterType}
          onEvent={handleEvent}
          onLoadError={setError}
        />
      </View>

      <View className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-4 pt-2">
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          className="rounded-xl bg-white/90 px-4 py-2"
          onPress={() => router.back()}
        >
          <Text className="font-bold text-slate-900">戻る</Text>
        </Pressable>
      </View>

      <View className="absolute bottom-0 left-0 right-0 flex-row justify-center gap-2 pb-6">
        {CHARACTER_TYPES.map((type) => (
          <Pressable
            accessibilityLabel={`${CHARACTER_TYPE_LABELS[type]}を表示`}
            accessibilityRole="button"
            accessibilityState={{ selected: type === characterType }}
            className={`rounded-xl px-4 py-3 ${
              type === characterType ? "bg-emerald-500" : "bg-white/90"
            }`}
            key={type}
            onPress={() => setCharacterType(type)}
          >
            <Text
              className={`font-bold ${type === characterType ? "text-white" : "text-slate-900"}`}
            >
              {CHARACTER_TYPE_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <View className="absolute left-4 right-4 top-16 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-xs text-red-700">{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
