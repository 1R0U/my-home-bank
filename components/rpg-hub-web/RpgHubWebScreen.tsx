import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMapStore } from "../../store/mapStore";
import { MAP_ROUTES, type MapObject } from "../../types/map";
import {
  createSetInputEnabledIntent,
  createSetInputIntent,
  createSetMapIntent,
  type Direction,
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
 * 現時点では開発ナビの「メイン（子供・Babylon版）」からのみ到達する。
 */
export default function RpgHubWebScreen() {
  const router = useRouter();
  const webViewRef = useRef<RpgHubWebHandle>(null);
  const objects = useMapStore((state) => state.objects);
  const currentSeason = useMapStore((state) => state.currentSeason);

  // ready を真偽値で持つと、WebView がバックグラウンド復帰などで再ロードして
  // ready を再送したときに setMap の effect が再実行されず、再生成されたシーンが
  // 空のまま残る。ready のたびに増える世代カウンタにして、必ず送り直す。
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // effect 内から最新値を参照するため、再実行を誘発しない形で保持する。
  const navigationLockedRef = useRef(navigationLocked);
  navigationLockedRef.current = navigationLocked;

  const nearbyBuilding = useMemo(
    () =>
      objects.find(
        (object): object is Extract<MapObject, { type: "building" }> =>
          object.type === "building" && object.id === nearbyId,
      ),
    [nearbyId, objects],
  );

  // シーンが準備できるたび（初回・再ロード後）と、マップが差し替わったときに送り込む。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetMapIntent(objects, currentSeason));
    // 再生成されたシーンの入力受付は既定で有効なので、遷移中なら止め直す。
    if (navigationLockedRef.current) {
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
    }
  }, [currentSeason, objects, sceneGeneration]);

  // 戻って画面が再フォーカスされた時に必ず入力を再有効化する。
  useFocusEffect(
    useCallback(() => {
      setNavigationLocked(false);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(true));
    }, []),
  );

  // 遷移は必ずここを通す。連続タップによる多重遷移を防ぐため、RN 側のロックに加えて
  // WebView 側の入力も止める（止めないとスティックの最後の入力が残り、遷移中も動き続ける）。
  const navigate = useCallback(
    (href: Href, warningMessage: string) => {
      if (navigationLocked) return;
      setNavigationLocked(true);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
      try {
        router.push(href);
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
        setSceneError(null);
        setSceneGeneration((generation) => generation + 1);
        return;
      }
      if (event.event === "nearby") {
        setNearbyId(event.id);
        return;
      }
      if (event.event === "navigate") {
        // route は bridge のパース時点で許可済みIDに限定されている。
        navigate(MAP_ROUTES[event.route], "RPGハブの画面遷移に失敗しました");
        return;
      }
      if (event.event === "error") {
        console.warn("[rpg-hub] シーンでエラー:", event.message);
        setSceneError(event.message || "不明なエラー");
      }
      // position はUI・保存用のスナップショット。現時点では表示に使っていない。
    },
    [navigate],
  );

  const handleLoadError = useCallback((message: string) => {
    setSceneError(message);
  }, []);

  const handleReload = () => {
    setSceneError(null);
    setNearbyId(null);
    setReloadKey((key) => key + 1);
  };

  const handleInputChange = useCallback((x: number, z: number, direction: Direction | null) => {
    webViewRef.current?.sendIntent(createSetInputIntent(x, z, direction));
  }, []);

  const handleEnterPress = () => {
    if (!nearbyBuilding) return;
    navigate(MAP_ROUTES[nearbyBuilding.route], "入口からの画面遷移に失敗しました");
  };

  const handleSettingsPress = () => {
    navigate("/settings", "設定画面への遷移に失敗しました");
  };

  return (
    <WebVirtualPad onInputChange={handleInputChange}>
      <View className="flex-1 bg-sky-100">
        <RpgHubWebView
          key={reloadKey}
          ref={webViewRef}
          onEvent={handleEvent}
          onLoadError={handleLoadError}
        />
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
        {sceneError && (
          <View className="absolute left-5 right-5 top-32 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="font-bold text-red-700">マップの表示に問題が起きました</Text>
            <Text className="mt-1 text-xs text-red-600">{sceneError}</Text>
            <Pressable
              accessibilityLabel="マップを再読み込みする"
              accessibilityRole="button"
              className="mt-3 self-start rounded-full bg-red-600 px-5 py-2 active:bg-red-700"
              onPress={handleReload}
            >
              <Text className="text-sm font-bold text-white">再読み込み</Text>
            </Pressable>
          </View>
        )}
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
