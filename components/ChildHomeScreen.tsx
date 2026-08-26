import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MAP_ROUTES, type MapObject } from "../types/map";
import { RpgHubScene } from "./rpg-hub/RpgHubScene";
import { VirtualPad } from "./rpg-hub/VirtualPad";

export default function ChildHomeScreen() {
  const router = useRouter();
  const [navigationLocked, setNavigationLocked] = useState(false);

  // 戻って画面が再フォーカスされた時に必ず入力を再有効化する。
  useFocusEffect(
    useCallback(() => {
      setNavigationLocked(false);
    }, []),
  );

  const handleObjectPress = (object: MapObject) => {
    if (navigationLocked || object.type !== "building") return;
    setNavigationLocked(true);
    try {
      router.push(MAP_ROUTES[object.route]);
    } catch (error) {
      console.warn("RPGハブの画面遷移に失敗しました", error);
      setNavigationLocked(false);
    }
  };

  const handleSettingsPress = () => {
    if (navigationLocked) return;
    setNavigationLocked(true);
    try {
      router.push("/settings");
    } catch (error) {
      console.warn("設定画面への遷移に失敗しました", error);
      setNavigationLocked(false);
    }
  };

  return (
    <VirtualPad>
      <View className="flex-1 bg-sky-100">
        <RpgHubScene onObjectPress={handleObjectPress} />
        <View className="absolute left-5 right-20 top-14 rounded-2xl bg-white/90 px-4 py-3">
          <Text className="text-lg font-bold text-slate-900">我が家タウン</Text>
          <Text className="mt-1 text-xs text-slate-600">建物をタップして、家族の冒険を始めよう</Text>
        </View>
        <Pressable
          accessibilityLabel="設定を開く"
          accessibilityRole="button"
          className="absolute right-5 top-14 h-12 w-12 items-center justify-center rounded-2xl bg-white/90"
          onPress={handleSettingsPress}
        >
          <Text className="text-2xl text-slate-700">⚙</Text>
        </Pressable>
        {navigationLocked && (
          <View className="absolute inset-0 items-center justify-center bg-slate-950/20" pointerEvents="auto">
            <View className="rounded-full bg-white px-5 py-3">
              <Text className="font-semibold text-slate-700">移動しています…</Text>
            </View>
          </View>
        )}
      </View>
    </VirtualPad>
  );
}
