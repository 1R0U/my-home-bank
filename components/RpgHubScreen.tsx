import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlacedDecorations } from "../lib/usePlacedDecorations";
import { useWardrobe } from "../lib/useWardrobe";
import { useMapStore } from "../store/mapStore";
import { useActiveRole } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";
import { type MapObject, type MapRouteId } from "../types/map";
import { resolveMapRoute } from "../lib/rpg-hub/routes";
import { getDialogue } from "../lib/rpg-hub/dialogues";
import { HOUSE_INTERIOR_ENTRY } from "../lib/rpg-hub/mapObjects";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement";
import { getDecorationPlacement, getPlaceableDecorations, groundedY } from "../lib/rpg-hub/catalog";
import {
  PLACEMENT_REJECTION_MESSAGES,
  canPlaceDecoration,
  findNearestPlacedId,
  getPlacementPoint,
} from "../lib/rpg-hub/placement";
import {
  createPlacePlayerIntent,
  createSetInputEnabledIntent,
  createSetInputIntent,
  createSetMapIntent,
  createSetPlayerEquipmentIntent,
  type Direction,
  type RpgHubEvent,
} from "../lib/rpg-hub/bridge";
import DecorationMode from "./rpg-hub-web/DecorationMode";
import { RpgHubWebView, type RpgHubWebHandle } from "./rpg-hub-web/RpgHubWebView";
import { WebVirtualPad } from "./rpg-hub-web/WebVirtualPad";

/**
 * 足元の装飾をしまえる距離（ワールド座標）。
 *
 * 置く距離（`PLACE_DISTANCE` = 1.6）より少し広くして、置いた直後にそのまま
 * しまい直せるようにしている。狭いと「置いたのに拾えない」が起きる。
 */
const REMOVE_DISTANCE = 2;

/**
 * RPGハブ画面（我が家タウン）。ルートは /rpg-hub。
 *
 * 3Dの描画・移動・衝突・接近判定は WebView 内の Babylon.js シーン
 * （webview/rpg-hub/scene.ts）が担当し、この画面は入力の受け渡しと、
 * 遷移・接近UIなどのネイティブUIだけを持つ。
 *
 * **大人・子供のどちらも同じこの画面へ入る**（Issue #245 / #246）。ロールで変わるのは
 * 建物の行き先だけで（`resolveMapRoute`）、画面そのものは1つしか持たない。
 *
 * **町の中身は人ごとに孤立している。** 建物・道・散らした木はコード内の定数
 * （`INITIAL_MAP_OBJECTS`）なので全員同じだが、置いた装飾と着ているものは
 * `users.id` に紐づく（`usePlacedDecorations` / `useWardrobe`）。利用者が変わったら
 * 取得を待たずに消すので、前の人の庭や帽子が残ることはない。
 */
export default function RpgHubScreen() {
  const router = useRouter();
  // 建物の行き先はロールで変わる（大人はタスク・ストアが大人用画面／Issue #247）。
  const role = useActiveRole();
  const webViewRef = useRef<RpgHubWebHandle>(null);
  const objects = useMapStore((state) => state.objects);
  const currentSeason = useMapStore((state) => state.currentSeason);

  // 置いた装飾をDBから読み込んでマップへ足す（Issue #223）。
  // objects が変わると下の effect が setMap を送り直すため、反映は自動で乗る。
  const { place, remove } = usePlacedDecorations();
  const placedDecorations = useMapStore((state) => state.placedDecorations);

  // 所有と装備をDBから読み込む（Issue #222）。
  // equipment が変わると下の effect が setPlayerEquipment を送り直す。
  useWardrobe();
  const equipment = useWardrobeStore((state) => state.equipment);

  // ready を真偽値で持つと、WebView がバックグラウンド復帰などで再ロードして
  // ready を再送したときに setMap の effect が再実行されず、再生成されたシーンが
  // 空のまま残る。ready のたびに増える世代カウンタにして、必ず送り直す。
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 自分の家のどこにいるか（Issue #235）。家（と2階）は画面遷移ではなくテレポートで
  // 出入りするので、建物のように router.push を挟まない。この画面にいたままUIだけ切り替える。
  // "town" のときだけ、家の外に出るボタンを隠す（2階からは階段を下りないと出られない）。
  const [houseLocation, setHouseLocation] = useState<"ground" | "town" | "upstairs">("town");

  // 建物から出てきたときに、その扉の前へ立たせるための持ち越し。
  // 入った建物は ref（遷移の瞬間に決まり、再レンダリングは要らない）、
  // 戻ってきたら state へ移して effect で送る（WebView が用意できてから送る必要があるため）。
  const enteredBuildingIdRef = useRef<string | null>(null);
  const [exitBuildingId, setExitBuildingId] = useState<string | null>(null);

  // 遷移ロックの実体は ref（state ではない）。navigate イベントは React の commit を
  // 待たずに連続で届きうるため、state を条件に使うと同じ値を2回読んで多重遷移する。
  // state 側はオーバーレイ表示のためだけに持つ。
  const navigationLockedRef = useRef(false);

  // かざるモードの状態（Issue #224）。null ならモードに入っていない。
  // プレイヤーの位置と向きは position スナップショットから受け取る。
  const [decorating, setDecorating] = useState<{
    assetId: string;
    message: string | null;
  } | null>(null);
  const [player, setPlayer] = useState({ facingY: 0, x: 0, z: 0 });

  // 置く・しまうの処理中かどうか。**ref で持つのは、連打が React の commit を待たずに
  // 届くため**（遷移ロックと同じ理由）。state だと同じ値を2回読んで二重に書き込み、
  // 同じ場所に重なった装飾ができたり、上限を1つ超えたりする。
  const placingRef = useRef(false);
  const [placing, setPlacing] = useState(false);

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

  // 着せ替えの結果をキャラクターへ反映する。
  // シーンが再生成されたときも送り直す。**再生成直後は何も着ていない状態**なので、
  // 送り直さないとバックグラウンド復帰のたびに裸になる。
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetPlayerEquipmentIntent(equipment));
  }, [equipment, sceneGeneration]);

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
        // 入った建物として覚えたIDも捨てる。残すと、次にこの画面へ戻ってきたときに
        // 「行けなかった建物から出てきた」位置へプレイヤーが飛ぶ
        enteredBuildingIdRef.current = null;
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

  /**
   * 指定した route を持つ建物の「出口」（`getBuildingExitPoint`）へプレイヤーを
   * テレポートさせる（Issue #235）。階段の上り下りと、家から出るときの3か所で使う共通処理。
   * @param route - 目的地の建物が持つ route
   */
  const teleportToRouteExit = useCallback(
    (route: MapRouteId) => {
      const target = objects.find((object) => object.type === "building" && object.route === route);
      if (target?.type === "building") {
        const exit = getBuildingExitPoint(target);
        webViewRef.current?.sendIntent(createPlacePlayerIntent(exit.x, exit.z, exit.facingY));
      }
    },
    [objects],
  );

  /**
   * 自分の家の中へ入る（Issue #235）。
   *
   * 他の建物と違い、画面遷移ではなくプレイヤーをテレポートさせるだけにしてある。
   * 家の中も同じ3Dのマップ上の場所（町から離れた座標）なので、この画面のまま
   * 位置だけ動かせば「別の場所」に見える。
   */
  const enterHouse = useCallback(() => {
    webViewRef.current?.sendIntent(
      createPlacePlayerIntent(HOUSE_INTERIOR_ENTRY.x, HOUSE_INTERIOR_ENTRY.z, HOUSE_INTERIOR_ENTRY.facingY),
    );
    setHouseLocation("ground");
  }, []);

  /** 家の中から出て、家の扉の前へ戻る。 */
  const handleExitHouse = () => {
    teleportToRouteExit("house");
    setHouseLocation("town");
  };

  /** 階段を上って2階へ行く。2階の階段の前に立たせる（Issue #235）。 */
  const enterUpstairs = useCallback(() => {
    teleportToRouteExit("downstairs");
    setHouseLocation("upstairs");
  }, [teleportToRouteExit]);

  /** 階段を下りて1階（増築した部屋）へ戻る。 */
  const exitUpstairs = useCallback(() => {
    teleportToRouteExit("upstairs");
    setHouseLocation("ground");
  }, [teleportToRouteExit]);

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
      if (event.event === "position") {
        // 装飾を正面へ置くために、位置と向きを持っておく（Issue #224）。
        // 間引かれたスナップショットなので、判定より粗いが置く先を決めるには足りる。
        setPlayer({ facingY: event.facingY, x: event.x, z: event.z });
        return;
      }
      if (event.event === "navigate") {
        if (event.route === "house") {
          enterHouse();
          return;
        }
        if (event.route === "upstairs") {
          enterUpstairs();
          return;
        }
        if (event.route === "downstairs") {
          exitUpstairs();
          return;
        }
        // route は bridge のパース時点で許可済みIDに限定されている。
        // 戻ってきたときに扉の前へ立たせたいので、どの建物へ入ったかを覚えておく。
        const target = objects.find(
          (object) => object.type === "building" && object.route === event.route,
        );
        enteredBuildingIdRef.current = target?.id ?? null;
        navigate(resolveMapRoute(event.route, role), "RPGハブの画面遷移に失敗しました");
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
    [enterHouse, enterUpstairs, exitUpstairs, navigate, objects, role, startTalk],
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
      if (nearbyObject.route === "house") {
        enterHouse();
        return;
      }
      if (nearbyObject.route === "upstairs") {
        enterUpstairs();
        return;
      }
      if (nearbyObject.route === "downstairs") {
        exitUpstairs();
        return;
      }
      enteredBuildingIdRef.current = nearbyObject.id;
      navigate(resolveMapRoute(nearbyObject.route, role), "入口からの画面遷移に失敗しました");
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

  const placeableAssetIds = useMemo(() => getPlaceableDecorations(), []);

  // かざるモード中、しまえる装飾が足元にあるか。**置いたものだけが対象**で、
  // 町の固定物（建物・道・散らした木）はしまえない。
  const nearbyPlacedId = useMemo(
    () => (decorating ? findNearestPlacedId(player, objects, REMOVE_DISTANCE) : null),
    [decorating, objects, player],
  );

  const handleDecoratePress = () => {
    setDecorating({ assetId: placeableAssetIds[0], message: null });
  };

  /** 選んだ装飾を、プレイヤーの正面へ置く。置けないときは理由を出す。 */
  const handlePlace = () => {
    if (!decorating || placingRef.current) return;
    const point = getPlacementPoint(player, player.facingY);
    const placement = getDecorationPlacement(decorating.assetId);
    if (!placement) return;

    const solid = placement.solid !== false;
    const candidate: MapObject = {
      collidable: solid,
      ...(solid ? { collisionSize: { depth: placement.size, width: placement.size } } : {}),
      id: "__candidate__",
      interactive: false,
      model: decorating.assetId as MapObject["model"],
      position: { x: point.x, y: groundedY(placement.halfHeight, 1), z: point.z },
      type: "decoration",
    };

    const rejection = canPlaceDecoration(candidate, objects, player, placedDecorations.length);
    if (rejection) {
      setDecorating((current) =>
        current ? { ...current, message: PLACEMENT_REJECTION_MESSAGES[rejection] } : null,
      );
      return;
    }

    setDecorating((current) => (current ? { ...current, message: null } : null));
    placingRef.current = true;
    setPlacing(true);
    place({
      assetId: decorating.assetId,
      // 向きはプレイヤーと同じにする。正面に置いたものがこちらを向く
      rotationY: player.facingY,
      scale: 1,
      x: point.x,
      z: point.z,
    })
      .catch((e: unknown) => {
        setDecorating((current) =>
          current
            ? { ...current, message: e instanceof Error ? e.message : "おけませんでした" }
            : null,
        );
      })
      .finally(() => {
        placingRef.current = false;
        setPlacing(false);
      });
  };

  /** 足元の装飾をしまう。詰んでしまった置き方から戻る手段でもある。 */
  const handleRemove = () => {
    if (!nearbyPlacedId || placingRef.current) return;
    setDecorating((current) => (current ? { ...current, message: null } : null));
    placingRef.current = true;
    setPlacing(true);
    remove(nearbyPlacedId)
      .catch((e: unknown) => {
        setDecorating((current) =>
          current
            ? { ...current, message: e instanceof Error ? e.message : "しまえませんでした" }
            : null,
        );
      })
      .finally(() => {
        placingRef.current = false;
        setPlacing(false);
      });
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
        {/*
          3Dは画面いっぱいに描いたまま、**重ねるUIだけ**をノッチ・ホームバーの内側へ入れる。
          画面ごと SafeAreaView で包むと3Dの上下に帯が出て、見える範囲が狭くなる。
          box-none にして、UIの無いところのタップ・ドラッグは下の仮想パッドへ通す。
        */}
        <SafeAreaView
          className="absolute bottom-0 left-0 right-0 top-0"
          edges={["bottom", "top"]}
          pointerEvents="box-none"
        >
          <View className="absolute left-5 right-52 top-4 rounded-2xl bg-white/90 px-4 py-3">
            <Text className="text-lg font-bold text-slate-900">
              {houseLocation === "town" ? "我が家タウン" : houseLocation === "ground" ? "自分の家" : "自分の家（2階）"}
            </Text>
            <Text className="mt-1 text-xs text-slate-600">
              {houseLocation === "town" ? "建物をタップして、家族の冒険を始めよう" : "すきなものを かざってみよう"}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="設定を開く"
            accessibilityRole="button"
            className="absolute right-5 top-4 h-12 w-12 items-center justify-center rounded-2xl bg-white/90"
            onPress={handleSettingsPress}
          >
            <Text className="text-2xl text-slate-700">⚙</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="かざるをはじめる"
            accessibilityRole="button"
            className="absolute right-20 top-4 h-12 w-12 items-center justify-center rounded-2xl bg-white/90"
            onPress={handleDecoratePress}
          >
            <Text className="text-2xl">🌳</Text>
          </Pressable>
          {houseLocation === "ground" && (
            <Pressable
              accessibilityLabel="家の外に出る"
              accessibilityRole="button"
              className="absolute right-36 top-4 h-12 w-12 items-center justify-center rounded-2xl bg-white/90"
              onPress={handleExitHouse}
            >
              <Text className="text-2xl">🚪</Text>
            </Pressable>
          )}
          {sceneError && (
            <View className="absolute left-5 right-5 top-24 rounded-2xl bg-red-50 px-4 py-3">
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
            // 会話中の板は box-none にしない。板の上をなぞった指を下の仮想パッドが拾い、
            // 会話の上にスティックの輪が出てしまう
            <View className="absolute bottom-5 left-5 right-5 rounded-3xl bg-white/95 p-5">
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
          {decorating && (
            <DecorationMode
              assetIds={placeableAssetIds}
              message={decorating.message}
              nearbyPlacedId={nearbyPlacedId}
              onExit={() => setDecorating(null)}
              onPlace={handlePlace}
              onRemove={handleRemove}
              onSelect={(assetId) =>
                setDecorating((current) => (current ? { assetId, message: null } : null))
              }
              placedCount={placedDecorations.length}
              placing={placing}
              selectedAssetId={decorating.assetId}
            />
          )}
        </SafeAreaView>
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
