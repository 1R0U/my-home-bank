// キャラクターの見た目（ねこ・ハムスター等）を、ログイン・DB保存を経由せず実機で
// 目視確認するためだけの一時的な画面（Issue #287）。
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
import { createSetPlayerEquipmentIntent, type RpgHubEvent } from "../lib/rpg-hub/bridge";
import { ASSET_DEFINITIONS, getAssetLabel } from "../lib/rpg-hub/catalog";
import {
  CHARACTER_TYPES,
  CHARACTER_TYPE_LABELS,
  type CharacterType,
} from "../lib/rpg-hub/characterTypes";
import type { EquipmentMap } from "../lib/rpg-hub/equipment";
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type AssetId } from "../types/map";

// 所有(owned_items)の有無に関わらず、カタログにある着せ替え品を全部並べる。
// この画面は実機での見た目確認だけが目的で、DBの所有状態は見ない（Issue #300）。
const ALL_WEARABLES = ASSET_DEFINITIONS.filter((definition) => definition.category === "wearable");

export default function CharacterPreviewScreen() {
  const [characterType, setCharacterType] = useState<CharacterType>("frog");
  const [equipment, setEquipment] = useState<EquipmentMap>({});
  const [error, setError] = useState<string | null>(null);
  // WebViewが再生成されるたび（種類の切り替え含む）に ready が来るので、そのたびに
  // 現在選んでいる装備を送り直す。真偽値だと2回目以降のreadyで発火しないため世代カウンタにする。
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const webViewRef = useRef<RpgHubWebHandle>(null);

  const handleEvent = (event: RpgHubEvent) => {
    if (event.event === "error") setError(event.message);
    if (event.event === "ready") setSceneGeneration((generation) => generation + 1);
  };

  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetPlayerEquipmentIntent(equipment));
  }, [equipment, sceneGeneration]);

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

      <View className="absolute bottom-0 left-0 right-0 gap-2 pb-6">
        {EQUIPMENT_SLOTS.filter((slot) =>
          ALL_WEARABLES.some((definition) => definition.slot === slot),
        ).map((slot) => {
          const choices = ALL_WEARABLES.filter((definition) => definition.slot === slot);
          const selected = equipment[slot] ?? null;

          return (
            <ScrollView
              contentContainerClassName="flex-row items-center gap-2 px-4"
              horizontal
              key={slot}
              showsHorizontalScrollIndicator={false}
            >
              <Text className="font-bold text-white">{EQUIPMENT_SLOT_LABELS[slot]}</Text>
              {[null, ...choices.map((definition) => definition.id as AssetId)].map((assetId) => {
                const isSelected = selected === assetId;
                const label = assetId === null ? "なし" : (getAssetLabel(assetId) ?? assetId);

                return (
                  <Pressable
                    accessibilityLabel={`${EQUIPMENT_SLOT_LABELS[slot]}を${label}にする`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`rounded-xl px-3 py-2 ${isSelected ? "bg-emerald-500" : "bg-white/90"}`}
                    key={assetId ?? "none"}
                    onPress={() =>
                      setEquipment((prev) => {
                        const next = { ...prev };
                        if (assetId === null) delete next[slot];
                        else next[slot] = assetId;
                        return next;
                      })
                    }
                  >
                    <Text
                      className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-900"}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          );
        })}

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
      </View>

      {error && (
        <View className="absolute left-4 right-4 top-16 rounded-xl bg-red-50 px-4 py-3">
          <Text className="text-xs text-red-700">{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
