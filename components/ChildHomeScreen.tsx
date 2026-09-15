import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMapStore } from "../store/mapStore";
import { MAP_ROUTES, type MapObject } from "../types/map";
import { getDialogue } from "../lib/rpg-hub/dialogues";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement";
import {
  createPlacePlayerIntent,
  createSetInputEnabledIntent,
  createSetInputIntent,
  createSetMapIntent,
  type Direction,
  type RpgHubEvent,
} from "../lib/rpg-hub/bridge";
import { RpgHubWebView, type RpgHubWebHandle } from "./rpg-hub-web/RpgHubWebView";
import { WebVirtualPad } from "./rpg-hub-web/WebVirtualPad";

/**
 * 子供用ホーム画面（RPGハブ）。ルートは /main-child。
 *
 * 3Dの描画・移動・衝突・接近判定は WebView 内の Babylon.js シーン
 * （webview/rpg-hub/scene.ts）が担当し、この画面は入力の受け渡しと、
 * 遷移・接近UIなどのネイティブUIだけを持つ。
 */
export default function ChildHomeScreen() {
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

  // 建物から出てきたときに、その扉の前へ立たせるための持ち越し。
  // 入った建物は ref（遷移の瞬間に決まり、再レンダリングは要らない）、
  // 戻ってきたら state へ移して effect で送る（WebView が用意できてから送る必要があるため）。
  const enteredBuildingIdRef = useRef<string | null>(null);
  const [exitBuildingId, setExitBuildingId] = useState<string | null>(null);

  // 遷移ロックの実体は ref（state ではない）。navigate イベントは React の commit を
  // 待たずに連続で届きうるため、state を条件に使うと同じ値を2回読んで多重遷移する。
  // state 側はオーバーレイ表示のためだけに持つ。
  const navigationLockedRef = useRef(false);

  // 会話中に表示する内容。null なら会話していない。
  const [talk, setTalk] = useState<{ lines: readonly string[]; lineIndex: number; name: string } | null>(null);

  // 接近対象は建物とNPCの両方。どちらが近いかは WebView 側が距離で決めるので、
  // ここでは id から引き当てて、type によって出すUIを変えるだけにする。
  const nearbyObject = useMemo(
    () =>
      objects.find(
        (object): object is Extract<MapObject, { type: "building" | "npc" }> =>
          (object.type === "building" || object.type === "npc") && object.id === nearbyId,
      ),
    [nearbyId, objects],
  );

  // シーンが準備できるたび（初回・再ロード後）と、マップが差し替わったときに送り込む。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetMapIntent(objects, currentSeason));
  }, [currentSeason, objects, sceneGeneration]);

  /**
   * 移動入力を受け付けてよいかを1か所で決めて送る。
   *
   * 止める理由は「会話中」と「画面遷移中」の2つあり、**どちらか一方でも成り立てば止める**。
   * 理由ごとにバラバラに送ると、片方の都合で送った `true` がもう片方の停止を打ち消す。
   * 再生成されたシーンは入力受付が既定で有効なので、`sceneGeneration` が変わったときも
   * 送り直す（そうしないと、会話中にWebViewが再ロードされると動けてしまう）。
   */
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(
      createSetInputEnabledIntent(!talk && !navigationLocked),
    );
  }, [navigationLocked, sceneGeneration, talk]);

  /**
   * 建物から戻ってきたら、その扉の前へ立たせ直す。
   *
   * タップで遠くの建物へ入ると、戻ったときに立っていた場所のままで「その建物から出てきた」
   * ように見えないため。シーンが用意できてから送る必要があるので、`sceneGeneration` を待つ。
   */
  useEffect(() => {
    if (sceneGeneration === 0 || !exitBuildingId) return;
    const building = objects.find(
      (object) => object.type === "building" && object.id === exitBuildingId,
    );
    if (building?.type === "building") {
      const exit = getBuildingExitPoint(building);
      webViewRef.current?.sendIntent(createPlacePlayerIntent(exit.x, exit.z, exit.facingY));
    }
    setExitBuildingId(null);
  }, [exitBuildingId, objects, sceneGeneration]);

  // 戻って画面が再フォーカスされた時に遷移ロックを解く。
  // 入力を戻すのは上の effect（navigationLocked の変化で送られる）。
  // ここで無条件に true を送ると、会話中に戻ってきたときに動けてしまう。
  useFocusEffect(
    useCallback(() => {
      navigationLockedRef.current = false;
      setNavigationLocked(false);
      if (enteredBuildingIdRef.current) {
        setExitBuildingId(enteredBuildingIdRef.current);
        enteredBuildingIdRef.current = null;
      }
    }, []),
  );

  // 遷移は必ずここを通す。連続タップによる多重遷移を防ぐため、RN 側のロックに加えて
  // WebView 側の入力も止める（止めないとスティックの最後の入力が残り、遷移中も動き続ける）。
  const navigate = useCallback(
    (href: Href, warningMessage: string) => {
      if (navigationLockedRef.current) return;
      navigationLockedRef.current = true;
      setNavigationLocked(true);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
      try {
        router.push(href);
      } catch (error) {
        console.warn(warningMessage, error);
        navigationLockedRef.current = false;
        setNavigationLocked(false);
        webViewRef.current?.sendIntent(createSetInputEnabledIntent(true));
      }
    },
    [router],
  );

  /**
   * NPCとの会話を開く。
   * 会話データが無いIDでも画面が壊れないよう、代わりの1行を出す。
   */
  const startTalk = useCallback(
    (npcId: string) => {
      const npc = objects.find((object) => object.type === "npc" && object.id === npcId);
      if (!npc || npc.type !== "npc") return;
      const lines = getDialogue(npc.dialogueId) ?? ["…（いまは はなせないみたい）"];
      setTalk({ lines, lineIndex: 0, name: npc.name });
    },
    [objects],
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
        // 戻ってきたときに扉の前へ立たせたいので、どの建物へ入ったかを覚えておく。
        const target = objects.find(
          (object) => object.type === "building" && object.route === event.route,
        );
        enteredBuildingIdRef.current = target?.id ?? null;
        navigate(MAP_ROUTES[event.route], "RPGハブの画面遷移に失敗しました");
        return;
      }
      if (event.event === "talk") {
        startTalk(event.id);
        return;
      }
      if (event.event === "error") {
        console.warn("[rpg-hub] シーンでエラー:", event.message);
        setSceneError(event.message || "不明なエラー");
      }
      // position はUI・保存用のスナップショット。現時点では表示に使っていない。
    },
    [navigate, objects, startTalk],
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

  const handleInteractPress = () => {
    if (!nearbyObject) return;
    if (nearbyObject.type === "building") {
      enteredBuildingIdRef.current = nearbyObject.id;
      navigate(MAP_ROUTES[nearbyObject.route], "入口からの画面遷移に失敗しました");
      return;
    }
    startTalk(nearbyObject.id);
  };

  /** 会話を1行進める。最後まで読み終わっていたら閉じる。 */
  const handleTalkAdvance = () => {
    setTalk((current) => {
      if (!current) return null;
      const nextIndex = current.lineIndex + 1;
      if (nextIndex >= current.lines.length) return null;
      return { ...current, lineIndex: nextIndex };
    });
  };

  const handleTalkClose = () => setTalk(null);

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
        {nearbyObject && !talk && (
          <View className="absolute bottom-24 left-0 right-0 items-center" pointerEvents="box-none">
            <Pressable
              accessibilityLabel={nearbyObject.type === "building" ? "入る" : `${nearbyObject.name}とはなす`}
              accessibilityRole="button"
              className={`rounded-full px-8 py-3 ${
                nearbyObject.type === "building"
                  ? "bg-amber-500 active:bg-amber-600"
                  : "bg-emerald-600 active:bg-emerald-700"
              }`}
              onPress={handleInteractPress}
            >
              <Text className="text-base font-bold text-white">
                {nearbyObject.type === "building" ? "入る" : "はなす"}
              </Text>
            </Pressable>
          </View>
        )}
        {talk && (
          <View className="absolute bottom-10 left-5 right-5 rounded-3xl bg-white/95 p-5" pointerEvents="box-none">
            <Text className="text-sm font-bold text-emerald-700">{talk.name}</Text>
            <Text className="mt-2 text-base leading-6 text-slate-900">
              {talk.lines[talk.lineIndex]}
            </Text>
            <View className="mt-4 flex-row justify-end gap-3">
              <Pressable
                accessibilityLabel="会話を閉じる"
                accessibilityRole="button"
                className="rounded-full bg-slate-200 px-5 py-2 active:bg-slate-300"
                onPress={handleTalkClose}
              >
                <Text className="text-sm font-bold text-slate-700">とじる</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={talk.lineIndex + 1 >= talk.lines.length ? "会話を終わる" : "次の話を見る"}
                accessibilityRole="button"
                className="rounded-full bg-emerald-600 px-5 py-2 active:bg-emerald-700"
                onPress={handleTalkAdvance}
              >
                <Text className="text-sm font-bold text-white">
                  {talk.lineIndex + 1 >= talk.lines.length ? "おわり" : "つぎへ"}
                </Text>
              </Pressable>
            </View>
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
