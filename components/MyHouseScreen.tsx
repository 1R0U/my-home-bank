import { Stack, useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FurnitureImage, HouseFurnitureTray } from "./HouseFurnitureTray";
import { HouseRoomView, type HouseRoomViewHandle } from "./rpg-hub-web/HouseRoomView";
import { HOUSE_ROOM_BACKGROUND } from "./rpg-hub-web/sceneHtml";
import { MAX_STEP, WebVirtualPad } from "./rpg-hub-web/WebVirtualPad";
import {
  CHARACTER_CHATTER,
  findHouseFurniture,
  getArrivalX,
  getEntranceX,
  getFurnitureButton,
  HOUSE_ROOMS,
  ROOM_VIEW_ASPECT,
  type HouseFloor,
  type HouseFurniture,
} from "../lib/rpg-hub/houseRoom";
import {
  getPlaceableFurniture,
  getRoomFurniture,
  getStoredFurniture,
  isStorableFurniture,
  moveFurniture,
  placeFurniture,
  storeFurniture,
  type HousePlaceableKind,
} from "../lib/rpg-hub/houseLayout";
import { useHouseLayout } from "../lib/useHouseLayout";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { playSoundEffect } from "../lib/audio";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { useWardrobeStore } from "../store/wardrobeStore";

/** ひとことを出しておく時間（ミリ秒） */
const MESSAGE_MS = 2500;

/** ひとことを出していないときの案内 */
const HINT = "スティックで あるいて、かぐに ちかづこう";
/** もようがえ中の案内 */
const EDIT_HINT = "かぐを ゆびで つまんで うごかそう";
/** もようがえの一覧の家具をタップしたときに置く位置（部屋の横幅に対する割合）。まんなかに置き、ふさがっていれば近くへずらす */
const PLACE_X = 0.5;
/** 一覧から持ち上げた家具を、指に重ねて出す大きさ */
const DRAGGED_SIZE = 72;

type Frame = { height: number; width: number; x: number; y: number };

/**
 * 自分の家の中。ルートは /my-house（Issue #386）。
 *
 * たまごっちの「マイハウス」のように、3Dの部屋を真横から見た固定の視点で映す（描くのは HouseRoomView）。
 * キャラクターは我が家タウンと同じスティック（WebVirtualPad）で左右に歩かせる。部屋のまわりの
 * どこをドラッグしてもスティックが出る。しばらく触らないと、ひとりでうろうろ歩き出す。
 * 家具に近づくと下にボタンが出て、きがえ（クローゼット）・階段・外へ出る、などができる
 * （我が家タウンで建物に近づくと「入る」が出るのと同じ）。
 *
 * 部屋を表示できなかったときは家具に近づけないので、代わりに外へ出る・きがえる・階段のボタンを並べる。
 *
 * 「もようがえ」（Issue #425）では、ソファなどの家具を置く・指でつまんで動かす・しまうができる。
 * 下の一覧の家具は、タップすると部屋のまんなかあたりに、部屋までドラッグすると離した所に置く。
 * クローゼットは動かせるが、しまえない。配置は端末の中に保存する（useHouseLayout）。
 *
 * 1階・2階は画面を分けず、この画面の中で切り替える（階段を使うと部屋が入れ替わる）。
 * 町（RpgHubScreen）からは画面遷移で入ってくるので、外へ出るときは戻るだけでよい。
 * 戻った町の側が、家の扉の前に立たせ直す（RpgHubScreen の enteredBuildingIdRef）。
 */
export default function MyHouseScreen() {
  const router = useRouter();
  const roomRef = useRef<HouseRoomViewHandle>(null);
  const [floor, setFloor] = useState<HouseFloor>("ground");
  // 町から玄関を通って入ってくるので、扉の前から始める
  const [standX, setStandX] = useState(getEntranceX);
  const [message, setMessage] = useState<string>(HINT);
  const [isFocused, setIsFocused] = useState(true);
  // 近くにある使える家具のID。WebView が近づいた・離れたときに知らせてくる
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [isRoomFailed, setIsRoomFailed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // もようがえで選んでいる家具のID。WebView が家具をつままれたときに知らせてくる
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { layout, updateLayout } = useHouseLayout();
  // もようがえの一覧に出す家具の絵（PNG の data URL）。WebView が描けたものから届く
  const [thumbnails, setThumbnails] = useState<Partial<Record<HousePlaceableKind, string>>>({});
  // 一覧から持ち上げて、指に重ねて出している家具。x / y は画面の左上を原点とした指の位置
  const [dragging, setDragging] = useState<{ kind: HousePlaceableKind; overRoom: boolean; x: number; y: number } | null>(null);
  const draggingKindRef = useRef<HousePlaceableKind | null>(null);
  // 部屋の枠と画面の、画面全体での位置。持ち上げたときに測り、指が部屋の上にあるかを決める
  const roomFrameViewRef = useRef<View>(null);
  const roomFrameRef = useRef<Frame | null>(null);
  const screenViewRef = useRef<View>(null);
  const screenOriginRef = useRef({ x: 0, y: 0 });
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 遷移の二重実行を防ぐ。連打が React の commit を待たずに届くので ref で持つ
  const navigatingRef = useRef(false);

  // 町と同じ姿で歩かせるため、種類・色・装備を町と同じデータから読む（CharacterAvatar と同じ）。
  // 3つとも読み込みが終わるまでは送らない。途中の値で組み立てると、すぐ作り直すことになる
  const { isReady: isTypeReady } = useCharacterAppearance();
  const { isReady: isPaletteReady } = useCharacterPalette();
  const { isReady: isWardrobeReady } = useWardrobe();
  const characterType = useAppearanceStore((state) => state.characterType);
  const palette = useAppearanceStore((state) => state.palette);
  const equipment = useWardrobeStore((state) => state.equipment);
  const season = useMapStore((state) => state.currentSeason);
  const isLookReady = isTypeReady && isPaletteReady && isWardrobeReady;
  const lookKey = isLookReady ? getPortraitKey({ characterType, equipment, palette, season }) : null;
  const look = useMemo<PortraitLook | null>(
    () => (lookKey ? { characterType, equipment, palette, season } : null),
    // lookKey が同じなら中身も同じ（getPortraitKey の約束）。着替えて戻ってきたら作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey],
  );

  // 別の画面（きがえ）へ行っている間は歩かせない。戻ってきたら遷移ロックを解く
  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(
    () => () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    },
    [],
  );

  const hint = isEditing ? EDIT_HINT : HINT;

  /** ひとことを出し、しばらくしたら案内に戻す */
  const say = useCallback(
    (text: string) => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      setMessage(text);
      messageTimerRef.current = setTimeout(() => setMessage(hint), MESSAGE_MS);
    },
    [hint],
  );

  const navigate = useCallback(
    (href: Href) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      try {
        router.push(href);
      } catch (error) {
        console.warn("自分の家からの画面遷移に失敗しました", error);
        navigatingRef.current = false;
      }
    },
    [router],
  );

  /** 家の外（我が家タウン）へ出る。町から入ってきたので、戻るだけでよい */
  const goOutside = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    playSoundEffect("door");
    if (router.canGoBack()) router.back();
    else router.replace("/rpg-hub");
  }, [router]);

  const changeFloor = useCallback((next: HouseFloor) => {
    playSoundEffect("confirm");
    setStandX(getArrivalX(next));
    setFloor(next);
    // 新しい階で近くの家具を知らせてくるまで、前の階のボタンを出さない
    setNearbyId(null);
    setMessage(HINT);
  }, []);

  /** 家具の機能を実行する（家具に近づいて出たボタンが押されたときに呼ぶ） */
  const runAction = useCallback(
    (furniture: HouseFurniture) => {
      if (furniture.action === "wardrobe") {
        if (!navigatingRef.current) playSoundEffect("confirm");
        navigate("/wardrobe");
      }
      else if (furniture.action === "upstairs") changeFloor("upstairs");
      else if (furniture.action === "downstairs") changeFloor("ground");
      else if (furniture.action === "exit") goOutside();
      else if (furniture.reaction) {
        playSoundEffect("talk");
        say(furniture.reaction);
      }
    },
    [changeFloor, goOutside, navigate, say],
  );

  const handleCharacterTapped = useCallback(() => {
    playSoundEffect("talk");
    say(CHARACTER_CHATTER[Math.floor(Math.random() * CHARACTER_CHATTER.length)]);
  }, [say]);

  const handleFailed = useCallback(() => {
    setIsRoomFailed(true);
    setIsEditing(false);
  }, []);

  /** もようがえを始める・終える */
  const toggleEditing = useCallback(() => {
    playSoundEffect("confirm");
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    const next = !isEditing;
    setIsEditing(next);
    setMessage(next ? EDIT_HINT : HINT);
    setSelectedId(null);
    setNearbyId(null);
  }, [isEditing]);

  /** しまってある家具を、今の階に置く。置きたい所がふさがっていれば、近くの空いている所に置く */
  const placeStoredFurniture = useCallback(
    (kind: HousePlaceableKind, x: number = PLACE_X) => {
      if (!layout) return;
      const next = placeFurniture(layout, floor, kind, x);
      if (!next) {
        say("おく ばしょが ないよ");
        return;
      }
      playSoundEffect("confirm");
      updateLayout(next);
    },
    [floor, layout, say, updateLayout],
  );

  /** 選んでいる家具をしまう */
  const storeSelectedFurniture = useCallback(() => {
    if (!layout || !selectedId) return;
    playSoundEffect("confirm");
    updateLayout(storeFurniture(layout, selectedId));
    setSelectedId(null);
  }, [layout, selectedId, updateLayout]);

  /**
   * 画面全体での指の位置を、部屋の枠の中の位置にする。
   * @returns 部屋の枠の左上を原点とした位置。指が部屋の外なら null
   */
  const toRoomView = useCallback((pageX: number, pageY: number) => {
    const frame = roomFrameRef.current;
    if (!frame) return null;
    const viewX = pageX - frame.x;
    const viewY = pageY - frame.y;
    if (viewX < 0 || viewY < 0 || viewX > frame.width || viewY > frame.height) return null;
    return { viewX, viewY };
  }, []);

  /** 一覧から家具を持ち上げた。部屋の枠の位置を測っておく */
  const handleTrayDragStart = useCallback((kind: HousePlaceableKind, pageX: number, pageY: number) => {
    draggingKindRef.current = kind;
    roomFrameRef.current = null;
    roomFrameViewRef.current?.measureInWindow((x, y, width, height) => {
      roomFrameRef.current = { height, width, x, y };
    });
    screenViewRef.current?.measureInWindow((x, y) => {
      screenOriginRef.current = { x, y };
    });
    setSelectedId(null);
    setDragging({ kind, overRoom: false, x: pageX, y: pageY });
  }, []);

  /** 持ち上げた家具を動かしている。部屋の上では、置かれる位置に部屋の中で半透明の家具を出してもらう */
  const handleTrayDragMove = useCallback(
    (pageX: number, pageY: number) => {
      const kind = draggingKindRef.current;
      if (!kind) return;
      const point = toRoomView(pageX, pageY);
      roomRef.current?.dragFurniture(kind, point ? "move" : "cancel", point?.viewX ?? 0, point?.viewY ?? 0);
      setDragging({ kind, overRoom: point !== null, x: pageX, y: pageY });
    },
    [toRoomView],
  );

  /** 持ち上げた家具を離した。部屋の上なら、そこに置いてもらう（置く位置は furnitureDropped で届く） */
  const handleTrayDragEnd = useCallback(
    (pageX: number, pageY: number, cancelled: boolean) => {
      const kind = draggingKindRef.current;
      draggingKindRef.current = null;
      setDragging(null);
      if (!kind) return;
      const point = cancelled ? null : toRoomView(pageX, pageY);
      roomRef.current?.dragFurniture(kind, point ? "drop" : "cancel", point?.viewX ?? 0, point?.viewY ?? 0);
    },
    [toRoomView],
  );

  const handleFurnitureThumbnail = useCallback((kind: HousePlaceableKind, dataUrl: string) => {
    setThumbnails((current) => ({ ...current, [kind]: dataUrl }));
  }, []);

  const handleFurnitureMoved = useCallback(
    (furnitureId: string, x: number) => {
      if (!layout) return;
      updateLayout(moveFurniture(layout, floor, furnitureId, x));
    },
    [floor, layout, updateLayout],
  );

  /** スティックの入力を、左右の倒し具合（-1〜1）にして部屋へ渡す。部屋は真横から見ているので左右だけ使う */
  const handleStickInput = useCallback((x: number) => {
    roomRef.current?.move(x / MAX_STEP);
  }, []);

  /** 部屋を表示できなかったときの代わりのボタンから、家具の機能をすぐに使う */
  const pressByAction = (action: HouseFurniture["action"]) => {
    if (navigatingRef.current) return;
    const furniture = HOUSE_ROOMS[floor].furniture.find((item) => item.action === action);
    if (furniture) runAction(furniture);
  };

  const roomFurniture = useMemo(
    () => (layout ? getRoomFurniture(floor, layout) : HOUSE_ROOMS[floor].furniture),
    [floor, layout],
  );
  const nearbyFurniture = nearbyId && !isEditing ? findHouseFurniture(roomFurniture, nearbyId) : undefined;
  const nearbyButton = nearbyFurniture ? getFurnitureButton(nearbyFurniture) : null;
  const selectedFurniture = selectedId ? findHouseFurniture(roomFurniture, selectedId) : undefined;
  const storedFurniture = layout ? getStoredFurniture(layout) : [];
  const canEdit = layout !== null && !isRoomFailed;

  return (
    <View ref={screenViewRef} className="flex-1" style={{ backgroundColor: HOUSE_ROOM_BACKGROUND }}>
      {/*
        iOS 26 からは、画面のどこから右へスワイプしても前の画面へ戻るのが既定になった。
        スティックで右へ歩かせるドラッグが戻る操作に取られ、町へ戻されてしまうので、
        我が家タウン（RpgHubScreen、Issue #371）と同じく、戻るスワイプは画面の左端から始めたときだけにする
      */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false, headerShown: false }} />
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="mx-4 mt-2 flex-row items-center rounded-2xl bg-white/90 px-4 py-3">
          <Text className="flex-1 text-lg font-bold text-slate-900">
            {isEditing ? "もようがえ ちゅう" : HOUSE_ROOMS[floor].title}
          </Text>
          {canEdit ? (
            <Pressable
              accessibilityLabel={isEditing ? "もようがえを おわる" : "もようがえを する"}
              accessibilityRole="button"
              className="rounded-full bg-amber-300 px-4 py-2 active:bg-amber-400"
              onPress={toggleEditing}
            >
              <Text className="text-sm font-bold text-amber-950">{isEditing ? "✅ おわる" : "🪑 もようがえ"}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 部屋のまわりのどこをドラッグしても、我が家タウンと同じスティックが出る。
            部屋は横長なので横長の枠に映し、上下の余りを均等にして画面の縦の真ん中に置く */}
        <WebVirtualPad disabled={isEditing} onInputChange={handleStickInput}>
          <View className="flex-1 justify-center px-4">
            <View ref={roomFrameViewRef} style={{ aspectRatio: ROOM_VIEW_ASPECT }}>
              <HouseRoomView
                ref={roomRef}
                active={isFocused}
                editing={isEditing}
                floor={floor}
                layout={layout}
                look={look}
                onCharacterTapped={handleCharacterTapped}
                onFailed={handleFailed}
                onFurnitureDropped={placeStoredFurniture}
                onFurnitureMoved={handleFurnitureMoved}
                onFurnitureSelected={setSelectedId}
                onFurnitureThumbnail={handleFurnitureThumbnail}
                onNearbyChange={setNearbyId}
                standX={standX}
              />
            </View>
          </View>
        </WebVirtualPad>

        {/* キャラクターのひとこと（たまごっちの画面の下に出る文字のように） */}
        <View
          accessible
          accessibilityLabel={message}
          accessibilityLiveRegion="polite"
          className="mx-4 mt-3 rounded-2xl bg-white/95 px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">{message}</Text>
        </View>

        {/* 家具に近づくと出るボタン。出たり消えたりしても部屋が上下に動かないよう、高さは固定にする */}
        <View className="mx-4 mb-4 mt-3 h-24 flex-row gap-3">
          {isEditing ? (
            selectedFurniture && isStorableFurniture(selectedFurniture.id) ? (
              <MenuButton
                accessibilityLabel={`${selectedFurniture.label}を しまう`}
                emoji="📦"
                label={`${selectedFurniture.label}を しまう`}
                onPress={storeSelectedFurniture}
              />
            ) : storedFurniture.length > 0 ? (
              <HouseFurnitureTray
                draggingKind={dragging?.kind ?? null}
                items={storedFurniture}
                onDragEnd={handleTrayDragEnd}
                onDragMove={handleTrayDragMove}
                onDragStart={handleTrayDragStart}
                onPlace={placeStoredFurniture}
                thumbnails={thumbnails}
              />
            ) : (
              <View className="flex-1 items-center justify-center rounded-2xl bg-white/70">
                <Text className="text-sm font-bold text-slate-900">かぐは ぜんぶ おいたよ</Text>
              </View>
            )
          ) : isRoomFailed ? (
            <>
              <MenuButton accessibilityLabel="そとへ でる" emoji="🚪" label="そとへ" onPress={() => pressByAction("exit")} />
              {floor === "ground" && (
                <MenuButton accessibilityLabel="きがえる" emoji="👗" label="きがえ" onPress={() => pressByAction("wardrobe")} />
              )}
              <MenuButton
                accessibilityLabel={floor === "ground" ? "2かいへ いく" : "1かいへ いく"}
                emoji="🪜"
                label={floor === "ground" ? "2かいへ" : "1かいへ"}
                onPress={() => pressByAction(floor === "ground" ? "upstairs" : "downstairs")}
              />
            </>
          ) : nearbyFurniture && nearbyButton ? (
            <MenuButton
              accessibilityLabel={nearbyButton.label}
              emoji={nearbyButton.emoji}
              label={nearbyButton.label}
              onPress={() => runAction(nearbyFurniture)}
            />
          ) : null}
        </View>
      </SafeAreaView>

      {/* 一覧から持ち上げた家具。指で隠れないよう、指の少し上に出す。部屋の上では、部屋の中の半透明の家具が
          置かれる位置を示すので、こちらは消す（同じ家具が2つ見えて分かりにくいため） */}
      {dragging && !dragging.overRoom ? (
        <View
          pointerEvents="none"
          style={{
            left: dragging.x - screenOriginRef.current.x - DRAGGED_SIZE / 2,
            position: "absolute",
            top: dragging.y - screenOriginRef.current.y - DRAGGED_SIZE * 1.2,
          }}
          testID="dragged-furniture"
        >
          <FurnitureImage
            emoji={getPlaceableFurniture(dragging.kind).emoji}
            size={DRAGGED_SIZE}
            thumbnail={thumbnails[dragging.kind]}
          />
        </View>
      ) : null}
    </View>
  );
}

type MenuButtonProps = {
  /** 読み上げる名前。家具の名札と同じ言葉だと区別しにくいので、「〜する」の形にする */
  accessibilityLabel: string;
  emoji: string;
  label: string;
  onPress: () => void;
};

function MenuButton({ accessibilityLabel, emoji, label, onPress }: MenuButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="flex-1 items-center rounded-2xl bg-white/90 py-4 active:bg-white"
      onPress={onPress}
    >
      <Text className="text-3xl">{emoji}</Text>
      <Text className="mt-1 text-sm font-bold text-slate-900">{label}</Text>
    </Pressable>
  );
}
