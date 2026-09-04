import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMapStore } from "../store/mapStore";
import { usePlayerStore } from "../store/playerStore";
import { MAP_ROUTES, type MapObject } from "../types/map";
import { RpgHubScene } from "./rpg-hub/RpgHubScene";
import { VirtualPad } from "./rpg-hub/VirtualPad";

export default function ChildHomeScreen() {
  const router = useRouter();
  const [navigationLocked, setNavigationLocked] = useState(false);
  const nearbyBuildingId = usePlayerStore((state) => state.nearbyBuildingId);
  const objects = useMapStore((state) => state.objects);
  const nearbyBuilding = useMemo(
    () =>
      objects.find(
        (object): object is Extract<MapObject, { type: "building" }> =>
          object.type === "building" && object.id === nearbyBuildingId,
      ),
    [objects, nearbyBuildingId],
  );

  // 戻って画面が再フォーカスされた時に必ず入力を再有効化する。
  useFocusEffect(
    useCallback(() => {
      setNavigationLocked(false);
    }, []),
  );

  const navigate = (href: Href, warningMessage: string) => {
    if (navigationLocked) return;
    setNavigationLocked(true);
    try {
      router.push(href);
    } catch (error) {
      console.warn(warningMessage, error);
      setNavigationLocked(false);
    }
  };

  const handleObjectPress = (object: MapObject) => {
    if (object.type !== "building") return;
    navigate(MAP_ROUTES[object.route], "RPGハブの画面遷移に失敗しました");
  };

  const handleEnterPress = () => {
    if (!nearbyBuilding) return;
    navigate(MAP_ROUTES[nearbyBuilding.route], "入口からの画面遷移に失敗しました");
  };

  const handleSettingsPress = () => {
    navigate("/settings", "設定画面への遷移に失敗しました");
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
        {nearbyBuilding && (
          <View className="absolute bottom-24 left-0 right-0 items-center" pointerEvents="box-none">
            <Pressable
              accessibilityLabel="入る"
              accessibilityRole="button"
              className="rounded-full bg-amber-500 px-8 py-3 active:bg-amber-600"
              onPress={handleEnterPress}
            >
              <Text className="text-base font-bold text-white">入る</Text>
            </Pressable>
          </View>
        )}
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
