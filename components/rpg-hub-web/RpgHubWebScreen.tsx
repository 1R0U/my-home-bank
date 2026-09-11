import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMapStore } from "../../store/mapStore";
import { MAP_ROUTES, type MapObject } from "../../types/map";
import {
  createSetInputEnabledIntent,
  createSetInputIntent,
  createSetMapIntent,
  type RpgHubEvent,
} from "../../lib/rpg-hub/bridge";
import { RpgHubWebView, type RpgHubWebHandle } from "./RpgHubWebView";
import { WebVirtualPad } from "./WebVirtualPad";

/**
 * RPGハブ（WebView + Babylon.js 版）の画面。
 *
 * 3Dの描画・移動・衝突・接近判定は WebView 側のシーンが担当し、この画面は
 * 入力の受け渡しと、遷移・接近UIなどのネイティブUIだけを持つ。
 * 稼働中の R3F 版（components/ChildHomeScreen.tsx）とは別実装で、
 * 現時点では検証ルート /rpg-hub-web からのみ到達する。
 */
export default function RpgHubWebScreen() {
  const router = useRouter();
  const webViewRef = useRef<RpgHubWebHandle>(null);
  const objects = useMapStore((state) => state.objects);
  const currentSeason = useMapStore((state) => state.currentSeason);

  const [ready, setReady] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [nearbyId, setNearbyId] = useState<string | null>(null);

  const nearbyBuilding = useMemo(
    () =>
      objects.find(
        (object): object is Extract<MapObject, { type: "building" }> =>
          object.type === "building" && object.id === nearbyId,
      ),
    [nearbyId, objects],
  );

  // シーンの準備ができたら、マップと季節を送り込む。
  // マップが差し替わったときも送り直す。
  useEffect(() => {
    if (!ready) return;
    webViewRef.current?.sendIntent(createSetMapIntent(objects, currentSeason));
  }, [currentSeason, objects, ready]);

  // 戻って画面が再フォーカスされた時に必ず入力を再有効化する。
  useFocusEffect(
    useCallback(() => {
      setNavigationLocked(false);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(true));
    }, []),
  );

  const navigate = useCallback(
    (routeId: keyof typeof MAP_ROUTES, warningMessage: string) => {
      if (navigationLocked) return;
      setNavigationLocked(true);
      // 連続タップによる多重遷移を防ぐため、WebView 側の入力も止める。
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
      try {
        router.push(MAP_ROUTES[routeId]);
      } catch (error) {
        console.warn(warningMessage, error);
        setNavigationLocked(false);
        webViewRef.current?.sendIntent(createSetInputEnabledIntent(true));
      }
    },
    [navigationLocked, router],
  );

  const handleEvent = useCallback(
    (event: RpgHubEvent) => {
      if (event.event === "ready") {
        setReady(true);
        return;
      }
      if (event.event === "nearby") {
        setNearbyId(event.id);
        return;
      }
      if (event.event === "navigate") {
        // route は bridge のパース時点で許可済みIDに限定されている。
        navigate(event.route, "RPGハブの画面遷移に失敗しました");
        return;
      }
      if (event.event === "error") {
        console.warn("[rpg-hub] シーンでエラー:", event.message);
      }
      // position はUI・保存用のスナップショット。現時点では表示に使っていない。
    },
    [navigate],
  );

  const handleInputChange = useCallback((x: number, z: number, direction: Parameters<typeof createSetInputIntent>[2]) => {
    webViewRef.current?.sendIntent(createSetInputIntent(x, z, direction));
  }, []);

  const handleEnterPress = () => {
    if (!nearbyBuilding) return;
    navigate(nearbyBuilding.route, "入口からの画面遷移に失敗しました");
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
    <WebVirtualPad onInputChange={handleInputChange}>
      <View className="flex-1 bg-sky-100">
        <RpgHubWebView ref={webViewRef} onEvent={handleEvent} />
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
    </WebVirtualPad>
  );
}
