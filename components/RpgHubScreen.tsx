import { Ionicons } from "@expo/vector-icons";
import { type Href, Stack, useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Furigana from "./Furigana";
import HubMapView from "./rpg-hub-web/HubMapView";
import HubMenu, { type HubMenuItem } from "./rpg-hub-web/HubMenu";
import QuestRewardNotice from "./QuestRewardNotice";
import QuestStreakCelebration from "./QuestStreakCelebration";
import TravelLoadingScreen from "./TravelLoadingScreen";
import { WalkFramesPreparer } from "./WalkingCharacter";
import ZoomableMap from "./rpg-hub-web/ZoomableMap";
import { useHouseFurnitureLayouts } from "../lib/useHouseFurnitureLayouts";
import { usePlacedDecorations } from "../lib/usePlacedDecorations";
import { useSeasonClock } from "../lib/useSeasonClock";
import { useWardrobe } from "../lib/useWardrobe";
import { useMapStore } from "../store/mapStore";
import { useActiveRole, useCurrentUser } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";
import { useTravelStore } from "../store/travelStore";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useFamilyTown } from "../lib/useFamilyTown";
import { type BuildingMapObject, type MapObject, type MapRouteId, type NpcMapObject } from "../types/map";
import { getInteractLabel, resolveMapRoute, resolveSettingsRoute, TELEPORT_DESTINATIONS } from "../lib/rpg-hub/routes";
import { BUILDING_MAP_LABELS, getBuildingMapFuriganaLabel } from "../lib/rpg-hub/minimap";
import {
  CLOSED_FEATURE_LINES,
  CLOSED_FEATURE_TUTORIAL_STEPS,
  getFeatureAccess,
  getRouteFeature,
  LOADING_FEATURE_LINES,
  UNKNOWN_FEATURE_LINES,
} from "../lib/childFeatures";
import { useChildFeatureRestrictions } from "../lib/useChildFeatureRestrictions";
import { getDialogue } from "../lib/rpg-hub/dialogues";
import { stripFurigana } from "../lib/furigana";
import { getHouseLocation } from "../lib/rpg-hub/mapObjects";
import { getBuildingExitPoint } from "../lib/rpg-hub/movement";
import {
  createPlacePlayerIntent,
  createSetInputEnabledIntent,
  createSetInputIntent,
  type Direction,
  type RpgHubEvent,
} from "../lib/rpg-hub/bridge";
import DecorationDragGhost from "./rpg-hub-web/DecorationDragGhost";
import DecorationMode from "./rpg-hub-web/DecorationMode";
import { useDecorationEditor } from "./rpg-hub-web/useDecorationEditor";
import { useHouseFinishOptions } from "./rpg-hub-web/useHouseFinishOptions";
import { useOwnedStoreAssets } from "../lib/useOwnedStoreAssets";
import HubPerfOverlay from "./rpg-hub-web/HubPerfOverlay";
import { useHubPerfStats } from "./rpg-hub-web/useHubPerfStats";
import { SHOW_HUB_PERF } from "../lib/devRole";
import { RpgHubWebView, type RpgHubWebHandle } from "./rpg-hub-web/RpgHubWebView";
import { WebVirtualPad } from "./rpg-hub-web/WebVirtualPad";
import { useHubMinimap } from "./rpg-hub-web/useHubMinimap";
import { useHubSceneSync } from "./rpg-hub-web/useHubSceneSync";
import { AUDIO_SOURCES, playSoundEffect, type SoundEffectName, useTownBgm } from "../lib/audio";
import { UI_COLORS } from "../constants/ui";
import { TutorialFrame, TutorialHome } from "./tutorial/TutorialPressable";
import { getTutorialBuildingStepId } from "../lib/tutorial";
import { useTutorial } from "./tutorial/TutorialContext";
import TutorialDirection from "./tutorial/TutorialDirection";

/**
 * 町のシーンの準備を待つ最長の時間（ミリ秒）。これを過ぎても ready が来なければ、
 * 失敗として再読み込みのボタンを見せる。遅い端末でも普段の読み込みは収まる長さにしてある。
 */
export const SCENE_LOAD_TIMEOUT_MS = 20_000;

/** 準備を待ちきれなかったときに出す文言 */
const SCENE_LOAD_TIMEOUT_MESSAGE = "マップの読み込みに時間がかかっています。再読み込みしてください。";

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
  const tutorial = useTutorial();
  const router = useRouter();
  const isFocused = useIsFocused();
  // 我が家タウンのBGMは2曲を約5分おきに交互に流す（Issue #393）。
  const { start: startBgm, stop: stopBgm } = useTownBgm(AUDIO_SOURCES.rpgHubBgm1, AUDIO_SOURCES.rpgHubBgm2);
  // 建物の行き先はロールで変わる（大人はタスク・ストアが大人用画面／Issue #247）。
  const role = useActiveRole();
  // 親が子供ごとに使わないにした機能（Issue #348）。その建物は町に残したまま、入れなくする
  const currentUser = useCurrentUser();
  const featureRestrictions = useChildFeatureRestrictions();
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
  const placedDecorationActions = usePlacedDecorations();
  // 家の中の家具（クローゼット）の位置と向き（Issue #477）。objects に重ねて反映される
  const furnitureActions = useHouseFurnitureLayouts();
  const placedDecorations = useMapStore((state) => state.placedDecorations);
  const { data: ownedAssets, reload: reloadOwnedAssets, error: ownedError, loading: ownedLoading } = useOwnedStoreAssets();

  // 家族をNPCとして町に立たせる（Issue #255）。見た目は objects に入るので setMap に乗り、
  // クエスト数・残高は familyStatus として会話を組み立てるときに使う。
  useFamilyTown();
  const familyStatus = useMapStore((state) => state.familyStatus);
  // 家族一人ひとりの家（Issue #244）のラベルに名前を出すため。既に objects に混ざっている
  // 家族NPCの名前を使う（ChildHomeScreen2D.tsx と同じ考え方。1R0Uさんレビュー指摘：
  // lib/useFamilyMembers.ts を別に使うと、家族の取得が2重になる）。
  const familyMemberNames = useMemo(
    () =>
      Object.fromEntries(
        objects
          .filter((object): object is NpcMapObject & { familyMemberId: string } =>
            object.type === "npc" && !!object.familyMemberId,
          )
          .map((npc) => [npc.familyMemberId, npc.name]),
      ),
    [objects],
  );

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
  // 種類を選び直したら、下の key も変えて新しい形のシーンを作り直す（Issue #483）。
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
  // 利用者・種類・再読み込みごとに世代を進める。色だけの変更では作り直さない。
  // A→B→A と選び直しても最初の A の ready と区別できるよう、種類名だけを key にしない。
  // 描画中に更新すると、新しい種類と古い key の組み合わせは子へ渡されずに描画し直される。
  const [scene, setScene] = useState({ characterType, key: 0,
    typeLoaded: isCharacterTypeReady, userId: currentUser?.id });
  // キャラ選びの裏では町を作り直さず、戻った時点の種類を1回だけ反映する。
  // 利用者の変更と、その人の種類を初めて読み込んだときはフォーカスによらず反映する。
  // 裏で読み込み終えたときも、前の人の種類で一度マウントしてしまわないようにする。
  if (
    scene.userId !== currentUser?.id ||
    (isCharacterTypeReady && (!scene.typeLoaded || (isFocused && scene.characterType !== characterType)))
  ) {
    setScene({ characterType, key: scene.key + 1,
      typeLoaded: isCharacterTypeReady, userId: currentUser?.id });
  }
  const sceneKey = scene.key;
  const currentSceneKeyRef = useRef(sceneKey);
  currentSceneKeyRef.current = sceneKey;
  // どの WebView のシーンが用意できたか。用意できるまで「いどうちゅう」の画面を
  // 重ねておく（Issue #261）。sceneGeneration は再読み込みしても0へ戻らないので、別に持つ
  const [readySceneKey, setReadySceneKey] = useState<number | null>(null);
  const isSceneReady = readySceneKey === sceneKey;
  // 作り直す前の位置。家の中でキャラ選びを開いても、戻る場所を町の原点へ変えない。
  const lastReadySceneRef = useRef<{
    key: number;
    userId: string | undefined;
    position: { facingY: number; x: number; z: number };
  } | null>(null);
  const restoreRequestRef = useRef(0);
  const pendingRestoreRef = useRef<{
    key: number;
    position: { facingY: number; x: number; z: number };
    requestId: string;
  } | null>(null);

  useEffect(() => {
    setSceneError(null);
    setNearbyId(null);
  }, [sceneKey]);

  // シーンが ready も error も返さないまま止まることがある（WebView のプロセスが落ちたとき、
  // シーンのスクリプトが例外を出さずに止まったときなど）。「いどうちゅう」の画面は上のボタンも
  // 覆うので、待ち続けると抜け出せなくなる。一定時間で失敗として扱い、再読み込みのボタンを見せる。
  // 後から ready が届けば、ready の処理でエラーは消える（PR #411 レビュー対応）
  useEffect(() => {
    if (!isCharacterTypeReady || isSceneReady || sceneError) return;
    const timer = setTimeout(() => setSceneError(SCENE_LOAD_TIMEOUT_MESSAGE), SCENE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isCharacterTypeReady, isSceneReady, sceneError, sceneKey]);

  // 建物から出てきたときに、その扉の前へ立たせるための持ち越し。
  // 入った建物は ref（遷移の瞬間に決まり、再レンダリングは要らない）、
  // 戻ってきたら state へ移して effect で送る（WebView が用意できてから送る必要があるため）。
  const enteredBuildingIdRef = useRef<string | null>(null);
  const [exitBuildingId, setExitBuildingId] = useState<string | null>(null);
  // 家の中にいるとき、どの建物（家）から入ったか。町の「house」の建物は複数棟あるため
  // （Issue #244）、出るときに正しい建物の前へ戻すのに使う。state ではなく ref で持つ理由は
  // enteredBuildingIdRef と同じ（テレポートはこの画面を離れないので、戻るフォーカス処理も通らない）。
  const enteredHouseBuildingIdRef = useRef<string | null>(null);
  // 入った時点の、その建物の出口の座標（CodeRabbitレビュー指摘：家族マップの更新
  // （置いてある装飾の変化などで持ち場の割り当てが変わる）により、入った建物が
  // objects から消えることがある。その場合に buildingId での検索が失敗しても、
  // 「そとへ でる」が無反応にならないよう、入場時点の座標をフォールバックとして持つ）。
  const enteredHouseExitRef = useRef<{ facingY: number; x: number; z: number } | null>(null);
  // 今いる家の持ち主の users.id。自分の家（元からある house-building）に入ったときは null。
  // 他人の家に入っている間は、中の家具を使えないようにする（Issue #244）。
  const [visitedHouseOwnerId, setVisitedHouseOwnerId] = useState<string | null>(null);
  // 建物から戻ってきたときに始めた「いどうちゅう」の移動のID（Issue #261）。
  // 扉の前へ立たせ直したら、読み込めたと知らせて閉じる
  const returnTravelIdRef = useRef<number | null>(null);

  // 遷移ロックの実体は ref（state ではない）。「入る」ボタンやワープの確認は React の commit を
  // 待たずに連続で押されうるため、state を条件に使うと同じ値を2回読んで多重遷移する。
  // state 側はオーバーレイ表示のためだけに持つ。
  const navigationLockedRef = useRef(false);
  // 3D表示の枠。画面の上での位置を測る（Issue #477）
  const sceneFrameRef = useRef<ComponentRef<typeof View>>(null);

  const [player, setPlayer] = useState({ facingY: 0, x: 0, z: 0 });

  // 自分の家の中にいるか（Issue #235 / #444）。家の中は町と同じシーンの中にあり、
  // 画面遷移ではなくテレポートで出入りするので、建物のように router.push を挟まない。
  // この画面にいたままUIだけ切り替える。家の中にいるときだけ、メニューに家の外に出るボタンを出す。
  //
  // **別のstateへ手動で書き込まず、プレイヤーの実座標から毎回導出する（1R0Uさんレビュー指摘）。**
  // 入った時点でstateを書き換える形だと、WebViewの再読み込みや画面の
  // 作り直され方によって実際の位置とずれ、家から出られなくなることがあった。
  const houseLocation = useMemo(() => getHouseLocation(player.x, player.z), [player.x, player.z]);
  // 他人の家を訪ねている間かどうか（Issue #244）。中では何もできないようにする
  // （出口を除く。玄関から出られないと詰むため）。
  const isInsideOthersHouse = houseLocation === "house" && visitedHouseOwnerId !== null;

  // マップ表示（Issue #314）。いま居る区画の建物・NPC・道と、表示範囲（useHubMinimap）。
  const { minimapBounds, zoneBuildings, zoneDecorations, zoneNpcs, zonePaths } = useHubMinimap(
    objects,
    placedDecorations,
    houseLocation,
    player,
  );
  const [isMapOpen, setIsMapOpen] = useState(false);
  // マップ上で建物をタップしたあと、確認待ちの建物（Issue #406）。確認中は全体マップの
  // 代わりに確認カードを出す。null なら地図をそのまま表示する。
  const [pendingWarpBuilding, setPendingWarpBuilding] = useState<BuildingMapObject | null>(null);
  // 右上のメニュー（キャラ選び・かざる・きがえなど）を開いているか
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // 承認のお知らせ（#424）を出しているか、出すかどうかがまだ分からないか。その間は連続記録のお祝いを
  // 待たせる。お祝いが先に出て、あとから承認のお知らせに切り替わる（ファンファーレが2回鳴る）のを防ぐため、
  // 待たせた状態から始め、QuestRewardNotice が結果を知らせてから外す
  const [isQuestRewardNoticeVisible, setIsQuestRewardNoticeVisible] = useState(true);
  // 全体マップは小さい端末でも画面からあふれないよう、画面幅に合わせて小さくする
  // （見やすさの指摘対応。Issue #314）。
  const { width: windowWidth } = useWindowDimensions();
  const fullMapSize = Math.min(300, Math.floor(windowWidth * 0.78));

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
          (object.type === "building" || object.type === "npc") &&
          object.id === nearbyId &&
          // 他人の家の中では、出口（exit）以外の家具にボタンを出さない（Issue #244）
          !(isInsideOthersHouse && object.type === "building" && object.route !== "exit"),
      ),
    [isInsideOthersHouse, nearbyId, objects],
  );
  // 掲示板は「見る」、家の中の家具は「きがえる」など、行き先に合わせた言葉にする（getInteractLabel）
  const interactLabel = nearbyObject?.type === "building" ? getInteractLabel(nearbyObject.route) : "";

  // マップ・季節・装備・色を、シーンが準備できるたびと値が変わるたびに送る（useHubSceneSync）。
  useHubSceneSync(webViewRef, {
    currentSeason,
    currentSeasonRef,
    equipment,
    isPaletteReady,
    objects,
    palette,
    paletteCharacterType,
    sceneCharacterType: scene.characterType,
    sceneGeneration: isSceneReady ? sceneGeneration : 0,
  });

  // かざるの編集モード（Issue #477）。下の一覧から引っぱって置く・タップで選んで回す/しまう・
  // 長押しで動かす。状態と操作は useDecorationEditor、3D側は webview/rpg-hub/decorationEditor.ts
  const decorationEditor = useDecorationEditor({
    actions: placedDecorationActions,
    currentSeasonRef,
    furnitureActions,
    objects,
    ownedAssets,
    placedDecorations,
    player,
    reloadOwnedAssets,
    sceneGeneration,
    webViewRef,
  });
  const editing = decorationEditor.editing;
  const handleEditorEvent = decorationEditor.handleEvent;
  // 家の中の壁紙・床板（Issue #480）。かざるの「かべ」「ゆか」のタブで選ぶ
  const houseFinishes = useHouseFinishOptions({ editing, inHouse: houseLocation === "house", ownedAssets });

  /**
   * 移動入力を受け付けてよいかを1か所で決めて送る。
   *
   * 止める理由は「会話中」「画面遷移中」「マップを開いている間」「かざるの編集中」の4つあり、
   * **どれか一つでも成り立てば止める**。理由ごとにバラバラに送ると、片方の都合で
   * 送った `true` がもう片方の停止を打ち消す。マップを開いている間も止めないと、
   * 全体マップを見ている裏でキャラクターが動き続けてしまう（Issue #314指摘）。編集中に止めるのは、
   * 住人が置こうとしているマスへ歩いてこないようにするため（Issue #477）。
   * 再生成されたシーンは入力受付が既定で有効なので、`sceneGeneration` が変わったときも
   * 送り直す（そうしないと、会話中にWebViewが再ロードされると動けてしまう）。
   */
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(
      createSetInputEnabledIntent(!talk && !navigationLocked && !isMapOpen && !editing),
    );
  }, [editing, isMapOpen, navigationLocked, sceneGeneration, talk]);

  /**
   * 建物から戻ってきたら、その扉の前へ立たせ直す。
   *
   * マップからワープして遠くの建物へ入ると、戻ったときに立っていた場所のままで「その建物から出てきた」
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
      if (navigationLockedRef.current) return false;
      navigationLockedRef.current = true;
      setNavigationLocked(true);
      webViewRef.current?.sendIntent(createSetInputEnabledIntent(false));
      if (isTravel) useTravelStore.getState().startTravel();
      try {
        router.push(href);
        return true;
      } catch (error) {
        if (isTravel) useTravelStore.getState().endTravel();
        // 入った建物として覚えたIDも捨てる。残すと、次にこの画面へ戻ってきたときに
        // 「行けなかった建物から出てきた」位置へプレイヤーが飛ぶ
        enteredBuildingIdRef.current = null;
        console.warn(warningMessage, error);
        navigationLockedRef.current = false;
        setNavigationLocked(false);
        webViewRef.current?.sendIntent(createSetInputEnabledIntent(true));
        return false;
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
      // 他人の家の中にいる間は、家具（この時点で route は house/exit 以外。
      // それらはこの手前の handleTeleportRoute で処理済み）を使えない（Issue #244）。
      if (isInsideOthersHouse) return;
      const feature = getRouteFeature(route);
      const access = feature ? getFeatureAccess(featureRestrictions, currentUser, role, feature) : "open";
      if (feature && access !== "open") {
        // 入れないことを、建物の看板の会話として伝える。使えるか分からないとき（読み込み中・読み込めない）も
        // 入れない（フェイルクローズ）。読み込めなかったときは取り直しておく
        playSoundEffect("talk");
        const lines =
          access === "closed" ? CLOSED_FEATURE_LINES : access === "loading" ? LOADING_FEATURE_LINES : UNKNOWN_FEATURE_LINES;
        setTalk({ lineIndex: 0, lines: lines[feature], name: BUILDING_MAP_LABELS[route] });
        // 閉じていると決まったときだけ、使い方の案内のこの建物の手順を飛ばす
        if (access === "closed") CLOSED_FEATURE_TUTORIAL_STEPS[feature].forEach((stepId) => tutorial?.advance(stepId));
        if (access === "unknown") void featureRestrictions.reload();
        return;
      }
      playSoundEffect(enterSoundForRoute(route));
      enteredBuildingIdRef.current = buildingId;
      if (navigate(resolveMapRoute(route, role), warningMessage, true)) tutorial?.advance(getTutorialBuildingStepId(route));
    },
    [currentUser, featureRestrictions, isInsideOthersHouse, navigate, role, tutorial],
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
   * テレポートさせる（Issue #235）。家の出入りで使う。
   *
   * `buildingId` を渡すと、その建物を優先して探す。町の「house」の建物は複数棟あるため
   * （Issue #244）、家の中から戻るときは必ず渡して、入った棟の前へ戻す。渡さないとき
   * （家の中の玄関など、1つしかない行き先）は route だけで最初に見つかったものを使う。
   * `fallbackExit` を渡すと、`buildingId` で見つからなかったとき（CodeRabbitレビュー指摘：
   * 家族マップの更新で、入った建物が objects から消えることがある）にそちらを使う。
   * 渡さなければ、見つからないときは何もしない（今までの挙動のまま）。
   * @param route - 目的地の建物が持つ route
   * @param buildingId - 目的地として優先する建物のID（省略可）
   * @param fallbackExit - `buildingId` で見つからなかったときに使う、入場時点の座標（省略可）
   */
  const teleportToRouteExit = useCallback(
    (
      route: MapRouteId,
      buildingId?: string | null,
      fallbackExit?: { facingY: number; x: number; z: number } | null,
    ) => {
      const target = buildingId
        ? objects.find((object) => object.type === "building" && object.id === buildingId)
        : objects.find((object) => object.type === "building" && object.route === route);
      const exit = target?.type === "building" ? getBuildingExitPoint(target) : fallbackExit;
      if (exit) {
        webViewRef.current?.sendIntent(createPlacePlayerIntent(exit.x, exit.z, exit.facingY));
      }
    },
    [objects],
  );

  /**
   * 行き先の建物のうち、テレポートで行き来するもの（`TELEPORT_ROUTES`）を処理する（Issue #444）。
   * 該当すればテレポートして true を返す。
   *
   * - house（町の家）→ 家の中の玄関（exit）の前へ。`buildingId` が持つ `houseOwnerId` を
   *   覚えておき、他人の家なら中で何もできないようにする（Issue #244）。戻るときに
   *   正しい棟の前へ出すため、どの建物から入ったかも覚えておく。
   * - exit（家の中の玄関）→ 覚えておいた建物の前へ。
   *
   * `handleInteractPress`・マップからのワープが同じ分岐を
   * 必要とするため、1箇所にまとめる（1R0Uさんレビュー指摘：重複していると、
   * 部屋を増やしたときに片方だけ直し忘れる）。
   * @param route - 建物が持つ route
   * @param buildingId - 接近した・ワープ先の建物そのもののID（`route: "house"` が複数棟あるため）
   * @returns テレポートを実行したら true。他の建物なら false（呼び出し側が画面遷移を行う）
   */
  const handleTeleportRoute = useCallback(
    (route: MapRouteId, buildingId: string | null = null): boolean => {
      const destination = TELEPORT_DESTINATIONS[route];
      if (!destination) return false;
      playSoundEffect("door");
      if (route === "house") {
        const building = buildingId
          ? objects.find((object) => object.type === "building" && object.id === buildingId)
          : undefined;
        const buildingExit = building?.type === "building" ? getBuildingExitPoint(building) : null;
        enteredHouseBuildingIdRef.current = buildingId;
        enteredHouseExitRef.current = buildingExit;
        setVisitedHouseOwnerId(building?.type === "building" ? building.houseOwnerId ?? null : null);
        teleportToRouteExit(destination);
      } else {
        teleportToRouteExit(destination, enteredHouseBuildingIdRef.current, enteredHouseExitRef.current);
        enteredHouseBuildingIdRef.current = null;
        enteredHouseExitRef.current = null;
        setVisitedHouseOwnerId(null);
      }
      // 画面遷移で入る建物（enterBuilding）と同じく、案内の手順を進める
      tutorial?.advance(getTutorialBuildingStepId(route));
      return true;
    },
    [objects, teleportToRouteExit, tutorial],
  );

  /** 家の中から出て、町の家の扉の前へ戻る（メニューのボタン）。家の中の扉を使ったときと同じ */
  const handleExitHouse = () => {
    handleTeleportRoute("exit");
  };

  // 描画負荷の計測（Issue #200）。開発ビルドで `EXPO_PUBLIC_SHOW_PERF=1`（`npm run start:perf`）のときだけ（Issue #507）。
  // 値は HubPerfOverlay が購読し、この画面は描き直さない
  const { feed: perfFeed, handleReady: handlePerfReady, handleStats: handlePerfStats } = useHubPerfStats(
    webViewRef,
    SHOW_HUB_PERF,
  );

  const handleEvent = useCallback(
    (event: RpgHubEvent) => {
      // 破棄した WebView から遅れて届いた通知で、新しいシーンを準備済みにしない。
      if (currentSceneKeyRef.current !== sceneKey) return;
      // 編集モードのタップ・長押し・下ろした場所（Issue #477）
      if (handleEditorEvent(event)) return;
      if (event.event === "ready") {
        const previous = lastReadySceneRef.current;
        const sameUser = previous?.userId === currentUser?.id;
        // シーンの初期位置は原点（webview/rpg-hub/scene.ts）。初回と手動再読み込みはここへ戻す。
        const initialPosition = { facingY: 0, x: 0, z: 0 };
        const position = previous && sameUser ? previous.position : initialPosition;
        // 建物からの帰還待ちなら、既存の effect が扉の前へ立たせる。
        const shouldRestore = previous && sameUser && !exitBuildingId &&
          (previous.key !== sceneKey || pendingRestoreRef.current?.key === sceneKey);
        if (shouldRestore) {
          const requestId = `restore-${sceneKey}-${++restoreRequestRef.current}`;
          pendingRestoreRef.current = { key: sceneKey, position, requestId };
          webViewRef.current?.sendIntent(createPlacePlayerIntent(position.x, position.z, position.facingY, requestId));
          // readyの後にも初期座標が届く。配置完了の通知まで入力と表示の待機を続ける。
          setReadySceneKey(null);
        } else {
          pendingRestoreRef.current = null;
          setReadySceneKey(sceneKey);
        }
        // 同じ世代の再ロードなど、復元しないシーンは実際の初期位置に合わせる。
        const placed = shouldRestore ? position : initialPosition;
        setPlayer(placed);
        lastReadySceneRef.current = { key: sceneKey, position: placed, userId: currentUser?.id };
        handlePerfReady();
        setSceneError(null);
        setSceneGeneration((generation) => generation + 1);
        return;
      }
      if (event.event === "playerPlaced") {
        const pending = pendingRestoreRef.current;
        if (pending?.key !== sceneKey || pending.requestId !== event.requestId) return;
        pendingRestoreRef.current = null;
        setSceneError(null);
        setPlayer(pending.position);
        setReadySceneKey(sceneKey);
        return;
      }
      if (event.event === "nearby") {
        setNearbyId(event.id);
        return;
      }
      if (event.event === "position") {
        // 初期座標で、復元待ちの家の中の位置やミニマップを一瞬町へ戻さない。
        if (!isSceneReady || pendingRestoreRef.current?.key === sceneKey) return;
        // ミニマップ・家の中かどうか・装飾を置けるかの判定（プレイヤーと重ならないか）に使う。
        // 間引かれたスナップショットなので、判定より粗いが足りる。
        const position = { facingY: event.facingY, x: event.x, z: event.z };
        if (lastReadySceneRef.current?.key === sceneKey) lastReadySceneRef.current.position = position;
        setPlayer(position);
        return;
      }
      if (event.event === "talk") {
        startTalk(event.id);
        return;
      }
      if (event.event === "perfStats") {
        handlePerfStats(event);
        return;
      }
      if (event.event === "error") {
        console.warn("[rpg-hub] シーンでエラー:", event.message);
        setSceneError(event.message || "不明なエラー");
      }
      // position はUI・保存用のスナップショット。現時点では表示に使っていない。
    },
    [currentUser?.id, exitBuildingId, handleEditorEvent, handlePerfReady, handlePerfStats, isSceneReady, sceneKey, startTalk],
  );

  const handleLoadError = useCallback((message: string) => {
    if (currentSceneKeyRef.current !== sceneKey) return;
    setSceneError(message);
  }, [sceneKey]);

  const handleReload = () => {
    playSoundEffect("confirm");
    setSceneError(null);
    setNearbyId(null);
    // エラーからの手動再読み込みは、壊れた位置を持ち越さず初期位置からやり直す。
    lastReadySceneRef.current = null;
    pendingRestoreRef.current = null;
    setScene((previous) => ({ ...previous, key: previous.key + 1 }));
  };

  const handleInputChange = useCallback((x: number, z: number, direction: Direction | null) => {
    webViewRef.current?.sendIntent(createSetInputIntent(x, z, direction));
  }, []);

  const handleInteractPress = () => {
    if (!nearbyObject) return;
    if (nearbyObject.type === "building") {
      if (handleTeleportRoute(nearbyObject.route, nearbyObject.id)) return;
      enterBuilding(nearbyObject.route, nearbyObject.id, "入口からの画面遷移に失敗しました");
      return;
    }
    startTalk(nearbyObject.id);
  };

  /**
   * 全体マップ上の建物アイコンをタップすると、ワープするかどうかの確認を出す（Issue #406）。
   * 誤タップでいきなり画面が変わらないようにするため。
   */
  const handleMapBuildingPress = useCallback((building: BuildingMapObject) => {
    playSoundEffect("confirm");
    setPendingWarpBuilding(building);
  }, []);

  /**
   * ワープの確認で「ワープする」を押したときの処理。
   *
   * 歩いて入口へ着いたとき（`handleInteractPress`）と同じ分岐（テレポートか画面遷移か）
   * をそのまま使う。画面遷移は `enterBuilding()` を通し、入る音・「いどうちゅう」画面・
   * 連打防止を歩いて入るときと揃える（1R0Uさんレビュー指摘：以前は `navigate()` を
   * 直接呼んでおり、マップからのワープだけこれらが抜けていた）。
   */
  const handleConfirmWarp = useCallback(() => {
    const building = pendingWarpBuilding;
    setPendingWarpBuilding(null);
    if (!building) return;
    setIsMapOpen(false);
    if (handleTeleportRoute(building.route, building.id)) return;
    enterBuilding(building.route, building.id, "マップからの画面遷移に失敗しました");
  }, [enterBuilding, handleTeleportRoute, pendingWarpBuilding]);

  /** ワープの確認で「やめる」を押したとき。地図はそのまま開いた状態に戻す。 */
  const handleCancelWarp = useCallback(() => {
    playSoundEffect("cancel");
    setPendingWarpBuilding(null);
  }, []);

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
    tutorial?.advance("parent-town-back");
  };

  const handleSettingsPress = () => {
    return navigate(resolveSettingsRoute(role), "設定画面への遷移に失敗しました");
  };

  const handleWardrobePress = () => {
    navigate("/wardrobe", "きがえ画面への遷移に失敗しました");
  };

  const handleCharacterSelectPress = () => {
    navigate("/character-select", "キャラクター選択画面への遷移に失敗しました");
  };

  // 右上のメニューに並べるボタン。どれを押してもメニューは閉じる。
  // 開いたまま他の画面へ行くと、戻ってきたときに開いたままになっているため
  const menuItems: HubMenuItem[] = [
    { accessibilityLabel: "キャラクターをえらぶ", icon: "🐸", key: "character", onPress: handleCharacterSelectPress },
    // 家の中では家具を飾るので、木ではなくソファの絵にする（Issue #506）
    {
      accessibilityLabel: "かざるをはじめる",
      icon: houseLocation === "house" ? "🛋️" : "🌳",
      key: "decorate",
      onPress: decorationEditor.start,
    },
    { accessibilityLabel: "きがえを開く", icon: "👕", key: "wardrobe", onPress: handleWardrobePress },
    ...(houseLocation === "house"
      ? [{ accessibilityLabel: "家の外に出る", icon: "🚪", key: "exit", onPress: handleExitHouse }]
      : []),
    { accessibilityLabel: "設定を開く", icon: "⚙️", key: "settings", onPress: handleSettingsPress },
  ].map((item) => ({
    ...item,
    onPress: () => {
      // 家の外に出るときは handleExitHouse が扉の音を鳴らす
      if (item.key !== "exit") playSoundEffect("confirm");
      setIsMenuOpen(false);
      return item.onPress();
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
    setPendingWarpBuilding(null);
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
    // かざるの編集中はスティックを出さない。指の操作はすべて3D側で装飾を選ぶ・動かすのに使う（Issue #477）
    <WebVirtualPad disabled={editing} onInputChange={handleInputChange}>
      {/*
        iOS 26 からは、画面のどこから右へスワイプしても前の画面へ戻るのが既定になった。
        大人はホームから push で入ってくるため、キャラクターを右へ動かすドラッグが
        戻る操作に取られ、ホームへ戻されてしまう（Issue #371）。戻るスワイプは、
        以前と同じく画面の左端から始めたときだけにする。

        ナビゲーションの見出し（ルート名の「rpg-hub」が出る白い帯）は出さない。
        画面の見出しは右上のカードが持っており、帯の分だけ町が狭くなるだけのため。
      */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false, headerShown: false }} />
      <TutorialHome feature={houseLocation === "house" ? "house" : "town"} ready={isSceneReady && !isSceneLoading} />
      {/* 連続記録がキリのいい日数に届いたときのお祝い（Issue #372）。子供にだけ出る */}
      {/* 承認のお知らせを先に見せ、閉じてから連続記録のお祝いを出す（2つのポップアップを重ねない） */}
      <QuestRewardNotice onVisibleChange={setIsQuestRewardNoticeVisible} />
      <QuestStreakCelebration suspended={isQuestRewardNoticeVisible} />
      <View
        ref={sceneFrameRef}
        className="flex-1 bg-sky-100"
        onLayout={() => {
          // 一覧から引っぱる指の位置（画面の左上から）を、3D表示の中の位置へ直すのに使う（Issue #477）
          sceneFrameRef.current?.measureInWindow((x, y, _width, height) =>
            decorationEditor.onSceneFrameChange({ height, x, y }),
          );
        }}
      >
        <RpgHubWebView
          key={sceneKey}
          ref={webViewRef}
          characterType={scene.characterType}
          onEvent={handleEvent}
          onLoadError={handleLoadError}
        />
        {/* シーンがエラーになったら消す（エラー表示の横で計測が進んでいるように見せない） */}
        {perfFeed && !sceneError ? <HubPerfOverlay feed={perfFeed} /> : null}
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
          <View
            className="mx-4 mt-4"
            onLayout={(event) => {
              // 編集モードで、部屋がこの行（地図・メニュー）に隠れないようにする（Issue #477）
              const layout = event.nativeEvent.layout;
              decorationEditor.onTopOverlayBottomChange(layout.y + layout.height);
            }}
            pointerEvents="box-none"
          >
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
                  <TutorialFrame id="parent-town-back" />
                </Pressable>
              )}
              {/*
                かざるの編集中はマップを開けない・メニューを出さない（CodeRabbitレビュー指摘）。
                ワープや「家の外に出る」でキャラクターだけが動くと、編集している範囲（カメラ・マス目）と
                キャラクターの居場所が食い違う。編集はパネルの「おわる」で終える
              */}
              <Pressable
                accessibilityLabel="マップを開く"
                accessibilityRole="button"
                accessibilityState={{ disabled: editing }}
                disabled={editing}
                onPress={openMap}
              >
                <HubMapView
                  bounds={minimapBounds}
                  buildings={zoneBuildings}
                  decorations={zoneDecorations}
                  location={houseLocation}
                  npcs={zoneNpcs}
                  ownerNames={familyMemberNames}
                  paths={zonePaths}
                  player={player}
                  season={currentSeason}
                  size={96}
                />
              </Pressable>
              <View className="flex-1 items-center" pointerEvents="none">
                {isSceneReady && !sceneError && !navigationLocked && !talk && !editing && !isMapOpen && !isMenuOpen && houseLocation === "town" && (
                  <TutorialDirection objects={objects} player={player} nearbyId={nearbyId} />
                )}
              </View>
              {!editing && <HubMenu items={menuItems} onToggle={handleMenuToggle} open={isMenuOpen} />}
            </View>
            {sceneError && (
              <View className="mt-3 rounded-2xl bg-red-50 px-4 py-3">
                <Furigana className="font-bold text-red-700">{"マップの{表示|ひょうじ}に{問題|もんだい}が{起|お}きました"}</Furigana>
                <Furigana className="mt-1 text-xs text-red-600">{sceneError}</Furigana>
                <Pressable
                  accessibilityLabel="マップを再読み込みする"
                  accessibilityRole="button"
                  className="mt-3 self-start rounded-full bg-red-600 px-5 py-2 active:bg-red-700"
                  onPress={handleReload}
                >
                  <Furigana noWrap className="text-sm font-bold text-white">{"{再|さい}{読|よ}み{込|こ}み"}</Furigana>
                </Pressable>
              </View>
            )}
          </View>
          <Modal
            animationType="fade"
            onRequestClose={pendingWarpBuilding ? handleCancelWarp : closeMap}
            transparent
            visible={isMapOpen}
          >
            {/*
              Androidでは Modal の中身がアプリ全体の GestureHandlerRootView
              （app/_layout.tsx）とは別のネイティブ階層になり、その外側のラッパーが
              効かない。Modal の中にも個別に置く必要がある（CodeRabbitレビュー指摘）。
              https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/fundamentals/installation/
            */}
            <GestureHandlerRootView style={{ flex: 1 }}>
              <View className="flex-1 items-center justify-center bg-slate-950/70 px-6">
                {/*
                  確認カードの表示中もZoomableMapをアンマウントせずに残す（CodeRabbitレビュー
                  指摘：以前は確認カードとマップを三項演算子で切り替えており、「やめる」で
                  戻ったときに拡大率・位置が初期値にリセットされていた）。確認中は
                  pointerEventsで操作だけを止める。
                */}
                <View className="relative items-center rounded-3xl bg-white/95 p-4">
                  <Furigana noWrap className="mb-3 text-base font-bold text-slate-900">
                    {houseLocation === "town" ? "{我|わ}が{家|や}タウン" : "{自分|じぶん}の{家|いえ}"}
                  </Furigana>
                  <View
                    accessibilityElementsHidden={!!pendingWarpBuilding}
                    importantForAccessibility={pendingWarpBuilding ? "no-hide-descendants" : "auto"}
                    pointerEvents={pendingWarpBuilding ? "none" : "auto"}
                  >
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
                          onBuildingPress={handleMapBuildingPress}
                          ownerNames={familyMemberNames}
                          paths={zonePaths}
                          player={player}
                          season={currentSeason}
                          showLabels
                          size={fullMapSize * zoom}
                          zoom={zoom}
                        />
                      )}
                    </ZoomableMap>
                    <Furigana className="mt-2 text-xs text-slate-500">{"ピンチで{拡大|かくだい}・{縮小|しゅくしょう}できます"}</Furigana>
                    <Pressable
                      accessibilityLabel="マップを閉じる"
                      accessibilityRole="button"
                      className="mt-4 rounded-full bg-slate-800 px-6 py-3 active:bg-slate-900"
                      onPress={closeMap}
                    >
                      <Text className="font-bold text-white">とじる</Text>
                    </Pressable>
                  </View>
                  {pendingWarpBuilding && (
                    // マップ上の建物をタップした直後の、ワープするかどうかの確認（Issue #406）。
                    // 誤タップでいきなり画面が変わらないようにするため。
                    // accessibilityViewIsModal で、読み上げのフォーカスをこのカードの中に留める
                    // （1R0Uさんレビュー指摘：背後の地図を no-hide-descendants で隠すのと対になる）。
                    <View
                      accessibilityViewIsModal
                      className="absolute inset-0 items-center justify-center rounded-3xl bg-white/95 p-6"
                    >
                      <Furigana className="mb-5 text-base font-bold text-slate-900">
                        {`${getBuildingMapFuriganaLabel(pendingWarpBuilding, familyMemberNames)}へワープしますか？`}
                      </Furigana>
                      <View className="flex-row gap-3">
                        <Pressable
                          accessibilityLabel="ワープする"
                          accessibilityRole="button"
                          className="rounded-full bg-blue-600 px-6 py-3 active:bg-blue-700"
                          onPress={handleConfirmWarp}
                        >
                          <Text className="font-bold text-white">ワープする</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel="やめる"
                          accessibilityRole="button"
                          className="rounded-full bg-slate-200 px-6 py-3 active:bg-slate-300"
                          onPress={handleCancelWarp}
                        >
                          <Text className="font-bold text-slate-700">やめる</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </GestureHandlerRootView>
          </Modal>
          {nearbyObject && !talk && !editing && (
            <View className="absolute bottom-24 left-0 right-0 items-center" pointerEvents="box-none">
              <Pressable
                accessibilityLabel={nearbyObject.type === "building" ? stripFurigana(interactLabel) : `${nearbyObject.name}とはなす`}
                accessibilityRole="button"
                className={`rounded-full px-8 py-3 ${
                  nearbyObject.type === "building"
                    ? "bg-amber-500 active:bg-amber-600"
                    : "bg-emerald-600 active:bg-emerald-700"
                }`}
                onPress={handleInteractPress}
              >
                <Furigana noWrap className="text-base font-bold text-white">
                  {nearbyObject.type === "building" ? interactLabel : "はなす"}
                </Furigana>
                <TutorialFrame id={nearbyObject.type === "building" ? getTutorialBuildingStepId(nearbyObject.route) : undefined} />
              </Pressable>
            </View>
          )}
          {talk && (
            // 会話中の板は box-none にしない。板の上をなぞった指を下の仮想パッドが拾い、
            // 会話の上にスティックの輪が出てしまう
            <View className="absolute bottom-5 left-5 right-5 rounded-3xl bg-white/95 p-5">
              <Text className="text-sm font-bold text-emerald-700">{talk.name}</Text>
              <Furigana className="mt-2 text-base leading-6 text-slate-900">
                {talk.lines[talk.lineIndex]}
              </Furigana>
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
          {editing && (
            <DecorationMode
              assetIds={decorationEditor.assetIds}
              availableCounts={decorationEditor.availableCounts}
              busy={decorationEditor.busy || ownedLoading || Boolean(ownedError)}
              finishes={houseFinishes.finishes}
              message={ownedError ?? houseFinishes.error ?? decorationEditor.message}
              onCoveredHeightChange={decorationEditor.onPanelHeightChange}
              onDeselect={decorationEditor.deselect}
              onDragCancel={decorationEditor.onDragCancel}
              onDragEnd={decorationEditor.onDragEnd}
              onDragMove={decorationEditor.onDragMove}
              onDragStart={decorationEditor.onDragStart}
              onExit={decorationEditor.exit}
              onRemove={decorationEditor.removeSelected}
              onResetView={decorationEditor.resetView}
              onRotate={decorationEditor.rotateSelected}
              placedCount={placedDecorations.length}
              selected={decorationEditor.selectedInfo}
            />
          )}
        </SafeAreaView>
        {navigationLocked && (
          <View className="absolute inset-0 items-center justify-center bg-slate-950/20" pointerEvents="auto">
            <View className="rounded-full bg-white px-5 py-3">
              <Furigana className="font-semibold text-slate-700">{"{移動|いどう}しています…"}</Furigana>
            </View>
          </View>
        )}
        {isSceneLoading && <TravelLoadingScreen overlay />}
        {/*
          読み込み中の画面に出す歩く姿は、町のシーンの準備ができてから裏で描いておく（Issue #261）。
          シーンと同時に3Dを2つ立ち上げないため（PR #411 レビュー対応）
        */}
        {isFocused && isSceneReady && !navigationLocked && <WalkFramesPreparer />}
        {decorationEditor.drag && (
          <DecorationDragGhost assetId={decorationEditor.drag.assetId} position={decorationEditor.ghostPosition} />
        )}
      </View>
    </WebVirtualPad>
  );
}
