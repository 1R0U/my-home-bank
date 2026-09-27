// キャラクターの見た目（ねこ・ハムスター等、および色）を、ログイン・DB保存を経由せず
// 実機で目視確認するためだけの一時的な画面（Issue #287 / #253）。
//
// **確認が終わったら、このファイルと app/login.tsx の確認用リンクを削除すること。**
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RpgHubWebView,
  type RpgHubWebHandle,
} from "../components/rpg-hub-web/RpgHubWebView";
import { createSetPlayerPaletteIntent } from "../lib/rpg-hub/bridge";
import {
  CHARACTER_TYPES,
  CHARACTER_TYPE_LABELS,
  type CharacterType,
} from "../lib/rpg-hub/characterTypes";
import { PALETTE_COLOR_OPTIONS, PALETTE_SLOT_LABELS, type Palette } from "../lib/rpg-hub/palette";
import type { RpgHubEvent } from "../lib/rpg-hub/bridge";
import type { PaletteSlot } from "../types/map";

// カエルは skin と accent しか使わない（hair が無い）ため、確認できるのはこの2枠だけ
// （components/CharacterSelectScreen.tsx と同じ理由・同じ制限）。
const EDITABLE_PALETTE_SLOTS: readonly PaletteSlot[] = ["skin", "accent"];

export default function CharacterPreviewScreen() {
  const [characterType, setCharacterType] = useState<CharacterType>("frog");
  const [palette, setPalette] = useState<Palette>({});
  // ready を真偽値で持つと、WebView がバックグラウンド復帰などで再ロードして
  // ready を再送したとき（既に true → true で変化なし）に送信effectが再実行されず、
  // 再生成されたシーンへ色が送られない（components/RpgHubScreen.tsx と同じ理由。
  // PR #296レビュー対応）。ready のたびに増える世代カウンタにして、必ず送り直す。
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<RpgHubWebHandle>(null);

  const handleEvent = (event: RpgHubEvent) => {
    if (event.event === "ready") {
      setReadyGeneration((generation) => generation + 1);
      return;
    }
    if (event.event === "error") setError(event.message);
  };

  // ready になった（初回・種類を変えて作り直された・再ロードされた）たびに、
  // いま選んでいる色を送る。DBに保存されたものではなく、この画面のローカルな
  // 状態を送るだけ（目視確認専用）。
  useEffect(() => {
    if (readyGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetPlayerPaletteIntent(palette));
  }, [palette, readyGeneration]);

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

      <ScrollView
        className="absolute bottom-0 left-0 right-0 max-h-64"
        contentContainerClassName="items-center gap-3 pb-6 pt-3"
      >
        <View className="flex-row justify-center gap-2">
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

        {EDITABLE_PALETTE_SLOTS.map((slot) => (
          <View className="items-center" key={slot}>
            <Text className="mb-1 text-xs font-bold text-white">{PALETTE_SLOT_LABELS[slot]}</Text>
            <View className="flex-row flex-wrap justify-center gap-2 px-4">
              {PALETTE_COLOR_OPTIONS.map((option) => {
                const isSelected = palette[slot] === option.hex;
                return (
                  <Pressable
                    accessibilityLabel={`${PALETTE_SLOT_LABELS[slot]}を${option.label}にする`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`h-10 w-10 items-center justify-center rounded-full border-2 ${
                      isSelected ? "border-white" : "border-transparent"
                    }`}
                    key={option.hex}
                    onPress={() => setPalette((current) => ({ ...current, [slot]: option.hex }))}
                    style={{ backgroundColor: option.hex }}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {error && (
        <View className="absolute left-4 right-4 top-16 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-xs text-red-700">{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
