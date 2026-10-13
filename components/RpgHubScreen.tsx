import { Ionicons } from "@expo/vector-icons";
import { type Href, Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import HubMapView from "./rpg-hub-web/HubMapView";
import HubMenu, { type HubMenuItem } from "./rpg-hub-web/HubMenu";
import QuestStreakCelebration from "./QuestStreakCelebration";
import TravelLoadingScreen from "./TravelLoadingScreen";
import { WalkFramesPreparer } from "./WalkingCharacter";
import ZoomableMap from "./rpg-hub-web/ZoomableMap";
import { usePlacedDecorations } from "../lib/usePlacedDecorations";
import { useSeasonClock } from "../lib/useSeasonClock";
import { useWardrobe } from "../lib/useWardrobe";
import { useMapStore } from "../store/mapStore";
import { useActiveRole } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";
import { useTravelStore } from "../store/travelStore";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useFamilyTown } from "../lib/useFamilyTown";
import { type MapObject, type MapRouteId } from "../types/map";
import { resolveMapRoute } from "../lib/rpg-hub/routes";
import { getDialogue } from "../lib/rpg-hub/dialogues";
import { filterObjectsByLocation, getHouseLocation } from "../lib/rpg-hub/mapObjects";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement";
import { getPlaceableDecorations } from "../lib/rpg-hub/catalog";
import {
  PLACEMENT_REJECTION_MESSAGES,
  canPlaceDecoration,
  createPlacementCandidate,
  findNearestPlacedId,
} from "../lib/rpg-hub/placement";
import {
  createPlacePlayerIntent,
  createSetInputEnabledIntent,
  createSetInputIntent,
  type Direction,
  type RpgHubEvent,
} from "../lib/rpg-hub/bridge";
import DecorationMode from "./rpg-hub-web/DecorationMode";
import { useOwnedStoreAssets } from "../lib/useOwnedStoreAssets";
import { availableDecorationCount } from "../lib/storeAssets";
import { RpgHubWebView, type RpgHubWebHandle } from "./rpg-hub-web/RpgHubWebView";
import { WebVirtualPad } from "./rpg-hub-web/WebVirtualPad";
import { useHubMinimap } from "./rpg-hub-web/useHubMinimap";
import { useHubSceneSync } from "./rpg-hub-web/useHubSceneSync";
import { AUDIO_SOURCES, playSoundEffect, type SoundEffectName, useTownBgm } from "../lib/audio";
import { UI_COLORS } from "../constants/ui";

/**
 * 町のシーンの準備を待つ最長の時間（ミリ秒）。これを過ぎても ready が来なければ、
 * 失敗として再読み込みのボタンを見せる。遅い端末でも普段の読み込みは収まる長さにしてある。
 */
export const SCENE_LOAD_TIMEOUT_MS = 20_000;

/** 準備を待ちきれなかったときに出す文言 */
const SCENE_LOAD_TIMEOUT_MESSAGE = "マップの読み込みに時間がかかっています。再読み込みしてください。";

/**
 * 足元の装飾をしまえる距離（ワールド座標）。
 *
 * 置く距離（`PLACE_DISTANCE` = 1.6）より少し広くして、置いた直後にそのまま
 * しまい直せるようにしている。狭いと「置いたのに拾えない」が起きる。
 */
const REMOVE_DISTANCE = 2;

/**
 * 建物に入るときの効果音。掲示板は中へ入る建物ではないので見る音、それ以外は扉の音にする。
 * よその家を訪ねる音（`visit`）は、訪ねる機能が入ったときに使う。
 */
function enterSoundForRoute(route: MapRouteId): SoundEffectName {
  return route === "board" ? "board" : "door";
}

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
  // 我が家タウンのBGMは2曲を約5分おきに交互に流す（Issue #393）。
  const { start: startBgm, stop: stopBgm } = useTownBgm(AUDIO_SOURCES.rpgHubBgm1, AUDIO_SOURCES.rpgHubBgm2);
  // 建物の行き先はロールで変わる（大人はタスク・ストアが大人用画面／Issue #247）。
  const role = useActiveRole();
  const webViewRef = useRef<RpgHubWebHandle>(null);
  const objects = useMapStore((state) => state.objects);
  const currentSeason = useMapStore((state) => state.currentSeason);
  // 開いたまま季節の変わり目をまたいでも切り替える（Issue #282）。
  // currentSeason が変わると下の effect が setSeason を送る。
  useSeasonClock();
  // setMap は季節の変化では送り直さない（送ると建物や木まで作り直すため）。
  // 送るときに今の季節を添えられるよう、ref にも持っておく。
  const currentSeasonRef = useRef(currentSeason);
  currentSeasonRef.current = currentSeason;

  // 置いた装飾をDBから読み込んでマップへ足す（Issue #223）。
  // objects が変わると下の effect が setMap を送り直すため、反映は自動で乗る。
  const { place, remove } = usePlacedDecorations();
  const placedDecorations = useMapStore((state) => state.placedDecorations);
  const { data: ownedAssets, reload: reloadOwnedAssets, error: ownedError, loading: ownedLoading } = useOwnedStoreAssets();

  // 家族をNPCとして町に立たせる（Issue #255）。見た目は objects に入るので setMap に乗り、
  // クエスト数・残高は familyStatus として会話を組み立てるときに使う。
  useFamilyTown();
  const familyStatus = useMapStore((state) => state.familyStatus);

  // 所有と装備をDBから読み込む（Issue #222）。
  // equipment が変わると下の effect が setPlayerEquipment を送り直す。
  useWardrobe();
  const equipment = useWardrobeStore((state) => state.equipment);

  // 本人のキャラクターの色をDBから読み込む（Issue #254 / #253）。
  // palette が変わると下の effect が送り直す。characterType と違い、色は postMessage
  // で送るだけでシーンの作り直しを伴わないが、isReady が立つまでは送らない
  // （切り替え直後・新規マウント直後に前の利用者の色が一瞬映るのを防ぐため。
  // PR #296レビュー対応）。
  const { isReady: isPaletteReady } = useCharacterPalette();
  const palette = useAppearanceStore((state) => state.palette);
  const paletteCharacterType = useAppearanceStore((state) => state.paletteLoadedCharacterType);

  // 本人が選んでいるキャラクターの種類をDBから読み込む（Issue #287）。
  // 形はシーン生成時に組み立てる値のため、色・装備と違って生成中の差し替えはしない。
  // 選び直した反映は、この画面を出入りしてシーンが作り直されたときになる。
  // isReady が立つまで RpgHubWebView 自体をマウントしない（下のreturn）。読み込み前の
  // 既定値でシーンを作ってしまうと、本来の種類で作り直す二度手間や、利用者を切り替えた
  // 直後に前の人の種類が一瞬映る問題が起きるため（PR #290レビュー対応）。
  const { isReady: isCharacterTypeReady } = useCharacterAppearance();
  const characterType = useAppearanceStore((state) => state.characterType);

  // ready を真偽値で持つと、WebView がバックグラウンド復帰などで再ロードして
  // ready を再送したときに setMap の effect が再実行されず、再生成されたシーンが
  // 空のまま残る。ready のたびに増える世代カウンタにして、必ず送り直す。
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // どの WebView（reloadKey）のシーンが用意できたか。用意できるまで「いどうちゅう」の画面を
  // 重ねておく（Issue #261）。sceneGeneration は再読み込みしても0へ戻らないので、別に持つ
  const [readyReloadKey, setReadyReloadKey] = useState<number | null>(null);
  const isSceneReady = readyReloadKey === reloadKey;

  // シーンが ready も error も返さないまま止まることがある（WebView のプロセスが落ちたとき、
  // シーンのスクリプトが例外を出さずに止まったときなど）。「いどうちゅう」の画面は上のボタンも
  // 覆うので、待ち続けると抜け出せなくなる。一定時間で失敗として扱い、再読み込みのボタンを見せる。
  // 後から ready が届けば、ready の処理でエラーは消える（PR #411 レビュー対応）
  useEffect(() => {
    if (!isCharacterTypeReady || isSceneReady || sceneError) return;
    const timer = setTimeout(() => setSceneError(SCENE_LOAD_TIMEOUT_MESSAGE), SCENE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isCharacterTypeReady, isSceneReady, sceneError]);

  // WebViewはマウント時の種類で形を作る。スタックに町が残ったまま種類を選び直しても、
  // 新しい種類の色を古い形へ送らないよう、実際にシーンを作った種類を記録する。
  const [sceneCharacterType, setSceneCharacterType] = useState(characterType);
  useEffect(() => {
    if (isCharacterTypeReady) setSceneCharacterType(characterType);
    // 種類の選び直しだけではWebViewを再生成しないので、characterTypeは依存に含めない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCharacterTypeReady, reloadKey]);

  // 建物から出てきたときに、その扉の前へ立たせるための持ち越し。
  // 入った建物は ref（遷移の瞬間に決まり、再レンダリングは要らない）、
  // 戻ってきたら state へ移して effect で送る（WebView が用意できてから送る必要があるため）。
  const enteredBuildingIdRef = useRef<string | null>(null);
  const [exitBuildingId, setExitBuildingId] = useState<string | null>(null);
  // 建物から戻ってきたときに始めた「いどうちゅう」の移動のID（Issue #261）。
  // 扉の前へ立たせ直したら、読み込めたと知らせて閉じる
  const returnTravelIdRef = useRef<number | null>(null);

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

  // 自分の家のどこにいるか（Issue #235）。家（と2階）は画面遷移ではなくテレポートで
  // 出入りするので、建物のように router.push を挟まない。この画面にいたままUIだけ切り替える。
  // "town" のときだけ、家の外に出るボタンを隠す（2階からは階段を下りないと出られない）。
  //
  // **別のstateへ手動で書き込まず、プレイヤーの実座標から毎回導出する（1R0Uさんレビュー指摘）。**
  // enterHouse等の呼び出し時点でstateを書き換える形だと、WebViewの再読み込みや画面の
  // 作り直され方によって実際の位置とずれ、家から出られなくなることがあった。
  const houseLocation = useMemo(() => getHouseLocation(player.x, player.z), [player.x, player.z]);

  // マップ表示（Issue #314）。いま居る区画の建物・NPC・道と、表示範囲（useHubMinimap）。
  const { minimapBounds, zoneBuildings, zoneDecorations, zoneNpcs, zonePaths } = useHubMinimap(
    objects,
    placedDecorations,
    houseLocation,
    player,
  );
  const [isMapOpen, setIsMapOpen] = useState(false);
  // 右上のメニュー（キャラ選び・かざる・きがえなど）を開いているか
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // 全体マップは小さい端末でも画面からあふれないよう、画面幅に合わせて小さくする
  // （見やすさの指摘対応。Issue #314）。
  const { width: windowWidth } = useWindowDimensions();
  const fullMapSize = Math.min(300, Math.floor(windowWidth * 0.78));

  // 置く・しまうの処理中かどうか。**ref で持つのは、連打が React の commit を待たずに
  // 届くため**（遷移ロックと同じ理由）。state だと同じ値を2回読んで二重に書き込み、
  // 同じ場所に重なった装飾ができたり、上限を1つ超えたりする。
  const placingRef = useRef(false);
  const [placing, setPlacing] = useState(false);
  // かざるパネルが画面の下から隠している高さ。この帯の上から触り始めてもスティックを出さない
  const [decorationPanelHeight, setDecorationPanelHeight] = useState(0);

  // 会話中に表示する内容。null なら会話していない。
  const [talk, setTalk] = useState<{ lines: readonly string[]; lineIndex: number; name: string } | null>(null);

  // Expo Router のスタックでは、別画面へ進んでもこの画面がマウントされたまま残る。
  // フォーカスに追従させることで、我が家タウンを離れたら確実にBGMを止める。
  useFocusEffect(
    useCallback(() => {
      void startBgm();
      return stopBgm;
    }, [startBgm, stopBgm]),
  );

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
  // 掲示板は中へ入る建物ではないので「見る」にする（Issue #354）
  const interactLabel =
    nearbyObject?.type === "building" && nearbyObject.route === "board" ? "見る" : "入る";

  // マップ・季節・装備・色を、シーンが準備できるたびと値が変わるたびに送る（useHubSceneSync）。
  useHubSceneSync(webViewRef, {
    currentSeason,
    currentSeasonRef,
    equipment,
    isPaletteReady,
    objects,
    palette,
    paletteCharacterType,
    placementPreviewAssetId: decorating?.assetId || null,
    sceneCharacterType,
    sceneGeneration,
  });

  /**
   * 移動入力を受け付けてよいかを1か所で決めて送る。
   *
   * 止める理由は「会話中」「画面遷移中」「マップを開いている間」の3つあり、
   * **どれか一つでも成り立てば止める**。理由ごとにバラバラに送ると、片方の都合で
   * 送った `true` がもう片方の停止を打ち消す。マップを開いている間も止めないと、
   * 全体マップを見ている裏でキャラクターが動き続けてしまう（Issue #314指摘）。
   * 再生成されたシーンは入力受付が既定で有効なので、`sceneGeneration` が変わったときも
   * 送り直す（そうしないと、会話中にWebViewが再ロードされると動けてしまう）。
   */
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(
      createSetInputEnabledIntent(!talk && !navigationLocked && !isMapOpen),
    );
  }, [isMapOpen, navigationLocked, sceneGeneration, talk]);

  /**
   * 建物から戻ってきたら、その扉の前へ立たせ直す。
   *
   * タップで遠くの建物へ入ると、戻ったときに立っていた場所のままで「その建物から出てきた」
   * ように見えないため。シーンが用意できてから送る必要があるので、`sceneGeneration` を待つ。
   * 再読み込みしても `sceneGeneration` は0へ戻らないので、今の WebView の ready（`isSceneReady`）も待つ
   * （PR #421 CodeRabbitレビュー対応）。
   */
  useEffect(() => {
    if (sceneGeneration === 0 || !isSceneReady || !exitBuildingId) return;
    const building = objects.find(
      (object) => object.type === "building" && object.id === exitBuildingId,
    );
    if (building?.type === "building") {
      const exit = getBuildingExitPoint(building);
      webViewRef.current?.sendIntent(createPlacePlayerIntent(exit.x, exit.z, exit.facingY));
    }
    setExitBuildingId(null);
    // 扉の前に立たせ直したので、戻るときの「いどうちゅう」を閉じてよい（最低限の時間は見せる）
    if (returnTravelIdRef.current !== null) {
      useTravelStore.getState().setWaiting(returnTravelIdRef.current, false);
      returnTravelIdRef.current = null;
    }
  }, [exitBuildingId, isSceneReady, objects, sceneGeneration]);

  // 戻ってきたときにシーンが壊れていたら、「いどうちゅう」を重ねたままにせず、
  // エラーと再読み込みのボタンを見せる。建物にいる間に壊れていた（戻る前から sceneError がある）
  // ときも閉じるよう、戻ってきたこと（exitBuildingId）でも確かめる（PR #421 CodeRabbitレビュー対応）
  useEffect(() => {
    if (!sceneError || returnTravelIdRef.current === null) return;
    useTravelStore.getState().endTravel(returnTravelIdRef.current);
    returnTravelIdRef.current = null;
  }, [exitBuildingId, sceneError]);

  // 戻って画面が再フォーカスされた時に遷移ロックを解く。
  // 入力を戻すのは上の effect（navigationLocked の変化で送られる）。
  // ここで無条件に true を送ると、会話中に戻ってきたときに動けてしまう。
  useFocusEffect(
    useCallback(() => {
      navigationLockedRef.current = false;
      setNavigationLocked(false);
      if (enteredBuildingIdRef.current) {
        // 建物から町へ戻るときも「いどうちゅう」を出す（Issue #261）。町が前に出たここで始めて、
        // 扉の前へ立たせ直す瞬間を覆う。戻り方（戻るボタン・スワイプ・Androidの戻る・家の
        // 「そとへ」）を問わず、ここを通る。入る途中で戻ってきたときの入る分の移動は、ここで置き換わる
        const travel = useTravelStore.getState();
        const travelId = travel.startTravel();
        travel.setWaiting(travelId, true);
        returnTravelIdRef.current = travelId;
        setExitBuildingId(enteredBuildingIdRef.current);
        enteredBuildingIdRef.current = null;
      } else {
        // 建物以外（設定など）から戻ってきたときに、「いどうちゅう」の画面を残さない
        useTravelStore.getState().endTravel();
      }
    }, []),
  );

  // 遷移は必ずここを通す。連続タップによる多重遷移を防ぐため、RN 側のロックに加えて
  // WebView 側の入力も止める（止めないとスティックの最後の入力が残り、遷移中も動き続ける）。
  // 建物へ入るとき（isTravel）は、入った先の画面が用意できるまで「いどうちゅう」の画面を出す（Issue #261）。
  const navigate = useCallback(
    (href: Href, warningMessage: string, isTravel = false) => {
      if (navigationLockedRef.current) return;
      navigationLockedRef.current = true;
      setNavigationLocked(true);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
      if (isTravel) useTravelStore.getState().startTravel();
      try {
        router.push(href);
      } catch (error) {
        if (isTravel) useTravelStore.getState().endTravel();
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
   * 建物へ入る（画面遷移する）。入る音を鳴らし、戻ってきたときに扉の前へ立たせるため
   * どの建物へ入ったかを覚えておく。遷移中の連打では音も鳴らさない。
   */
  const enterBuilding = useCallback(
    (route: MapRouteId, buildingId: string | null, warningMessage: string) => {
      if (navigationLockedRef.current) return;
      playSoundEffect(enterSoundForRoute(route));
      enteredBuildingIdRef.current = buildingId;
      navigate(resolveMapRoute(route, role), warningMessage, true);
    },
    [navigate, role],
  );

  /**
   * NPCとの会話を開く。
   * 会話データが無いIDでも画面が壊れないよう、代わりの1行を出す。
   */
  const startTalk = useCallback(
    (npcId: string) => {
      const npc = objects.find((object) => object.type === "npc" && object.id === npcId);
      if (!npc || npc.type !== "npc") return;
      const lines = getDialogue(npc.dialogueId, { family: familyStatus, viewerRole: role }) ?? [
        "…（いまは はなせないみたい）",
      ];
      playSoundEffect("talk");
      setTalk({ lines, lineIndex: 0, name: npc.name });
    },
    [familyStatus, objects, role],
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

  /** 家の中から出て、家の扉の前へ戻る。 */
  const handleExitHouse = () => {
    playSoundEffect("door");
    teleportToRouteExit("house");
  };

  /** 階段を上って2階へ行く。2階の階段の前に立たせる（Issue #235）。 */
  const enterUpstairs = useCallback(() => {
    teleportToRouteExit("downstairs");
  }, [teleportToRouteExit]);

  /** 階段を下りて1階（増築した部屋）へ戻る。 */
  const exitUpstairs = useCallback(() => {
    teleportToRouteExit("upstairs");
  }, [teleportToRouteExit]);

  /**
   * upstairs / downstairs はテレポートで処理する（他の建物は画面遷移）。
   * 自分の家（house）は、家の中を別の画面（/my-house）にしたので画面遷移になった（Issue #386）。
   * 該当すればテレポートして true を返す。
   *
   * `handleEvent`（navigateイベント）と `handleInteractPress` の両方が同じ分岐を
   * 必要とするため、1箇所にまとめる（1R0Uさんレビュー指摘：重複していると、
   * 階や部屋を増やしたときに片方だけ直し忘れる）。
   * @param route - 建物が持つ route
   * @returns テレポートを実行したら true。他の建物なら false（呼び出し側が画面遷移を行う）
   */
  const handleTeleportRoute = useCallback(
    (route: MapRouteId): boolean => {
      if (route === "upstairs") {
        enterUpstairs();
        return true;
      }
      if (route === "downstairs") {
        exitUpstairs();
        return true;
      }
      return false;
    },
    [enterUpstairs, exitUpstairs],
  );

  const handleEvent = useCallback(
    (event: RpgHubEvent) => {
      if (event.event === "ready") {
        setSceneError(null);
        setSceneGeneration((generation) => generation + 1);
        setReadyReloadKey(reloadKey);
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
        if (handleTeleportRoute(event.route)) return;
        // route は bridge のパース時点で許可済みIDに限定されている。
        // 戻ってきたときに扉の前へ立たせたいので、どの建物へ入ったかを覚えておく。
        const target = objects.find(
          (object) => object.type === "building" && object.route === event.route,
        );
        enterBuilding(event.route, target?.id ?? null, "RPGハブの画面遷移に失敗しました");
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
    [enterBuilding, handleTeleportRoute, objects, reloadKey, startTalk],
  );

  const handleLoadError = useCallback((message: string) => {
    setSceneError(message);
  }, []);

  const handleReload = () => {
    playSoundEffect("confirm");
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
      if (handleTeleportRoute(nearbyObject.route)) return;
      enterBuilding(nearbyObject.route, nearbyObject.id, "入口からの画面遷移に失敗しました");
      return;
    }
    startTalk(nearbyObject.id);
  };

  /** 会話を1行進める。最後まで読み終わっていたら閉じる。 */
  const handleTalkAdvance = () => {
    playSoundEffect("confirm");
    setTalk((current) => {
      if (!current) return null;
      const nextIndex = current.lineIndex + 1;
      if (nextIndex >= current.lines.length) return null;
      return { ...current, lineIndex: nextIndex };
    });
  };

  const handleTalkClose = () => {
    playSoundEffect("cancel");
    setTalk(null);
  };

  /**
   * 大人用の戻るボタン。ホームから push で入ってくるので、ふつうは1つ前へ戻る。
   * 履歴が無いとき（Webで直接開いた・再読み込みしたなど）は大人用ホームへ移る。
   */
  const handleBackPress = () => {
    playSoundEffect("cancel");
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/main-adult");
    }
  };

  const handleSettingsPress = () => {
    navigate("/settings", "設定画面への遷移に失敗しました");
  };

  const handleWardrobePress = () => {
    navigate("/wardrobe", "きがえ画面への遷移に失敗しました");
  };

  const handleCharacterSelectPress = () => {
    navigate("/character-select", "キャラクター選択画面への遷移に失敗しました");
  };

  const placeableAssetIds = useMemo(() => getPlaceableDecorations().filter(
    (assetId) => ownedAssets.some((item) => item.asset_id === assetId && item.quantity > 0),
  ), [ownedAssets]);

  // 取得待ちで開いた場合や持ち物が変わった場合も、有効な選択へ戻す。
  // すでに選んだ装飾が残っていれば、その選択を維持する。
  useEffect(() => {
    setDecorating((current) => {
      if (!current || placeableAssetIds.some((assetId) => assetId === current.assetId)) return current;
      const assetId = placeableAssetIds[0] ?? "";
      return current.assetId === assetId ? current : { assetId, message: null };
    });
  }, [placeableAssetIds]);

  // かざるモード中、しまえる装飾が足元にあるか。**置いたものだけが対象**で、
  // 町の固定物（建物・道・散らした木）はしまえない。
  const nearbyPlacedId = useMemo(
    () => (decorating ? findNearestPlacedId(player, objects, REMOVE_DISTANCE) : null),
    [decorating, objects, player],
  );

  const handleDecoratePress = () => {
    void reloadOwnedAssets();
    setDecorating({ assetId: placeableAssetIds[0] ?? "", message: null });
  };

  // 右上のメニューに並べるボタン。どれを押してもメニューは閉じる。
  // 開いたまま他の画面へ行くと、戻ってきたときに開いたままになっているため
  const menuItems: HubMenuItem[] = [
    { accessibilityLabel: "キャラクターをえらぶ", icon: "🐸", key: "character", onPress: handleCharacterSelectPress },
    { accessibilityLabel: "かざるをはじめる", icon: "🌳", key: "decorate", onPress: handleDecoratePress },
    { accessibilityLabel: "きがえを開く", icon: "👕", key: "wardrobe", onPress: handleWardrobePress },
    ...(houseLocation === "ground"
      ? [{ accessibilityLabel: "家の外に出る", icon: "🚪", key: "exit", onPress: handleExitHouse }]
      : []),
    { accessibilityLabel: "設定を開く", icon: "⚙️", key: "settings", onPress: handleSettingsPress },
  ].map((item) => ({
    ...item,
    onPress: () => {
      // 家の外に出るときは handleExitHouse が扉の音を鳴らす
      if (item.key !== "exit") playSoundEffect("confirm");
      setIsMenuOpen(false);
      item.onPress();
    },
  }));

  const handleMenuToggle = () => {
    playSoundEffect("menu");
    setIsMenuOpen((current) => !current);
  };

  const openMap = () => {
    playSoundEffect("confirm");
    setIsMapOpen(true);
  };

  const closeMap = () => {
    playSoundEffect("cancel");
    setIsMapOpen(false);
  };

  /** 選んだ装飾を、プレイヤーの正面へ置く。置けないときは理由を出す。 */
  const handlePlace = () => {
    if (!decorating || placingRef.current) return;
    if (availableDecorationCount(decorating.assetId, ownedAssets, placedDecorations) <= 0) {
      setDecorating((current) => current ? { ...current, message: "このかざりはすべて配置済みです" } : null);
      return;
    }
    const candidate = createPlacementCandidate(decorating.assetId, player, player.facingY);
    if (!candidate) return;

    // 判定を同じ区画（家の中・2階・町）のオブジェクトだけに絞る。他区画は壁で
    // 閉じられていて絶対に行き来できないため、含めると到達判定が余分に重くなる
    // （1R0Uさんレビュー指摘）
    const zoneObjects = filterObjectsByLocation(objects, houseLocation);
    const rejection = canPlaceDecoration(candidate, zoneObjects, player, placedDecorations.length);
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
      x: candidate.position.x,
      z: candidate.position.z,
    })
      .then(() => playSoundEffect("decorate"))
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
      .then(() => playSoundEffect("confirm"))
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

  // キャラクターの種類の読み込みが終わるまでは、RpgHubWebView自体をマウントしない
  // （上のコメント参照）。ここでシーンを作ってしまうと、後で正しい種類に作り直す
  // 二度手間や、切り替え直後に前の人の種類が一瞬映る問題が起きる。
  // 待っている間は、自分のキャラクターが歩く「いどうちゅう」の画面を出す（Issue #261）。
  if (!isCharacterTypeReady) {
    return <TravelLoadingScreen />;
  }

  // シーンが用意できるまでは、WebView の上に「いどうちゅう」の画面を重ねる。WebView は
  // 裏で読み込ませておく必要があるので、外さずに覆う。失敗したときは、下のエラーと
  // 再読み込みのボタンが見えるよう重ねない
  const isSceneLoading = !isSceneReady && !sceneError;

  return (
    <WebVirtualPad
      ignoredBottomHeight={decorating ? decorationPanelHeight : 0}
      onInputChange={handleInputChange}
    >
      {/*
        iOS 26 からは、画面のどこから右へスワイプしても前の画面へ戻るのが既定になった。
        大人はホームから push で入ってくるため、キャラクターを右へ動かすドラッグが
        戻る操作に取られ、ホームへ戻されてしまう（Issue #371）。戻るスワイプは、
        以前と同じく画面の左端から始めたときだけにする。

        ナビゲーションの見出し（ルート名の「rpg-hub」が出る白い帯）は出さない。
        画面の見出しは右上のカードが持っており、帯の分だけ町が狭くなるだけのため。
      */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false, headerShown: false }} />
      {/* 連続記録がキリのいい日数に届いたときのお祝い（Issue #372）。子供にだけ出る */}
      <QuestStreakCelebration />
      <View className="flex-1 bg-sky-100">
        <RpgHubWebView
          key={reloadKey}
          ref={webViewRef}
          characterType={characterType}
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
          {/*
            左にミニマップ、右にメニュー。場所の名前（我が家タウン・自分の家）を出していた
            白いカードは、町を隠すだけなのでやめた（家の中にいるかどうかはミニマップで分かる）。
            エラーバナーはこの行と同じ縦の流れに入れ、行の下に自然に続ける。
          */}
          {/*
            absolute にしない。absolute の子は親の padding を無視するため、SafeAreaView が
            足したノッチ分の余白が効かず、ステータスバーに重なってボタンが押せなくなる
            （ナビゲーションの見出しを消してから表に出た）。流れの中に置けば余白の内側に並ぶ。
          */}
          <View className="mx-4 mt-4" pointerEvents="box-none">
            <View className="flex-row items-start" pointerEvents="box-none">
              {role === "parent" && (
                // 大人はホームから入ってくるので、左上に戻るボタンを出す。ナビゲーションの
                // 見出しを消したため、これが無いと画面の中に戻る手段が無い。子供には
                // この画面がホームなので出さない
                <Pressable
                  accessibilityLabel="ホームに戻る"
                  accessibilityRole="button"
                  className="mr-2 h-12 w-12 items-center justify-center rounded-2xl bg-white/90 active:bg-white"
                  onPress={handleBackPress}
                >
                  <Ionicons color={UI_COLORS.slate900} name="chevron-back" size={26} />
                </Pressable>
              )}
              <Pressable
                accessibilityLabel="マップを開く"
                accessibilityRole="button"
                onPress={openMap}
              >
                <HubMapView
                  bounds={minimapBounds}
                  buildings={zoneBuildings}
                  decorations={zoneDecorations}
                  location={houseLocation}
                  npcs={zoneNpcs}
                  paths={zonePaths}
                  player={player}
                  season={currentSeason}
                  size={96}
                />
              </Pressable>
              <View className="flex-1" pointerEvents="none" />
              <HubMenu items={menuItems} onToggle={handleMenuToggle} open={isMenuOpen} />
            </View>
            {sceneError && (
              <View className="mt-3 rounded-2xl bg-red-50 px-4 py-3">
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
          </View>
          <Modal animationType="fade" onRequestClose={closeMap} transparent visible={isMapOpen}>
            {/*
              Androidでは Modal の中身がアプリ全体の GestureHandlerRootView
              （app/_layout.tsx）とは別のネイティブ階層になり、その外側のラッパーが
              効かない。Modal の中にも個別に置く必要がある（CodeRabbitレビュー指摘）。
              https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/fundamentals/installation/
            */}
            <GestureHandlerRootView style={{ flex: 1 }}>
              <View className="flex-1 items-center justify-center bg-slate-950/70 px-6">
                <View className="items-center rounded-3xl bg-white/95 p-4">
                  <Text className="mb-3 text-base font-bold text-slate-900">
                    {houseLocation === "town" ? "我が家タウン" : houseLocation === "ground" ? "自分の家" : "自分の家（2階）"}
                  </Text>
                  {/*
                    ピンチで拡大・縮小して見られるようにする（見やすさの指摘対応。Issue #314）。
                    RN標準のScrollViewの拡大機能はiOS専用のため使わず、両OSで動く
                    ZoomableMap（react-native-gesture-handler）を使う（CodeRabbitレビュー指摘）。
                    `key` を区画で変えて、町↔家の中で開き直したときに前の拡大率を持ち越さない。
                    地図は拡大率に合わせた大きさで描き直し、目印はゆるやかにだけ大きくする（Issue #413）。
                  */}
                  <ZoomableMap key={houseLocation} size={fullMapSize}>
                    {(zoom) => (
                      <HubMapView
                        bounds={minimapBounds}
                        buildings={zoneBuildings}
                        decorations={zoneDecorations}
                        location={houseLocation}
                        npcs={zoneNpcs}
                        paths={zonePaths}
                        player={player}
                        season={currentSeason}
                        showLabels
                        size={fullMapSize * zoom}
                        zoom={zoom}
                      />
                    )}
                  </ZoomableMap>
                  <Text className="mt-2 text-xs text-slate-500">ピンチで拡大・縮小できます</Text>
                  <Pressable
                    accessibilityLabel="マップを閉じる"
                    accessibilityRole="button"
                    className="mt-4 rounded-full bg-slate-800 px-6 py-3 active:bg-slate-900"
                    onPress={closeMap}
                  >
                    <Text className="font-bold text-white">とじる</Text>
                  </Pressable>
                </View>
              </View>
            </GestureHandlerRootView>
          </Modal>
          {nearbyObject && !talk && (
            <View className="absolute bottom-24 left-0 right-0 items-center" pointerEvents="box-none">
              <Pressable
                accessibilityLabel={nearbyObject.type === "building" ? interactLabel : `${nearbyObject.name}とはなす`}
                accessibilityRole="button"
                className={`rounded-full px-8 py-3 ${
                  nearbyObject.type === "building"
                    ? "bg-amber-500 active:bg-amber-600"
                    : "bg-emerald-600 active:bg-emerald-700"
                }`}
                onPress={handleInteractPress}
              >
                <Text className="text-base font-bold text-white">
                  {nearbyObject.type === "building" ? interactLabel : "はなす"}
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
              message={ownedError ?? decorating.message}
              availableCount={availableDecorationCount(decorating.assetId, ownedAssets, placedDecorations)}
              nearbyPlacedId={nearbyPlacedId}
              onCoveredHeightChange={setDecorationPanelHeight}
              onExit={() => {
                playSoundEffect("cancel");
                setDecorating(null);
              }}
              onPlace={handlePlace}
              onRemove={handleRemove}
              onSelect={(assetId) => {
                playSoundEffect("confirm");
                setDecorating((current) => (current ? { assetId, message: null } : null));
              }}
              placedCount={placedDecorations.length}
              placing={placing || ownedLoading || Boolean(ownedError)}
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
        {isSceneLoading && <TravelLoadingScreen overlay />}
        {/*
          読み込み中の画面に出す歩く姿は、町のシーンの準備ができてから裏で描いておく（Issue #261）。
          シーンと同時に3Dを2つ立ち上げないため（PR #411 レビュー対応）
        */}
        {isSceneReady && <WalkFramesPreparer />}
      </View>
    </WebVirtualPad>
  );
}
