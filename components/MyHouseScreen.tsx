import { Stack, useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
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

  /** ひとことを出し、しばらくしたら案内に戻す */
  const say = useCallback((text: string) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = setTimeout(() => setMessage(HINT), MESSAGE_MS);
  }, []);

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
    if (router.canGoBack()) router.back();
    else router.replace("/rpg-hub");
  }, [router]);

  const changeFloor = useCallback((next: HouseFloor) => {
    setStandX(getArrivalX(next));
    setFloor(next);
    // 新しい階で近くの家具を知らせてくるまで、前の階のボタンを出さない
    setNearbyId(null);
    setMessage(HINT);
  }, []);

  /** 家具の機能を実行する（家具に近づいて出たボタンが押されたときに呼ぶ） */
  const runAction = useCallback(
    (furniture: HouseFurniture) => {
      if (furniture.action === "wardrobe") navigate("/wardrobe");
      else if (furniture.action === "upstairs") changeFloor("upstairs");
      else if (furniture.action === "downstairs") changeFloor("ground");
      else if (furniture.action === "exit") goOutside();
      else if (furniture.reaction) say(furniture.reaction);
    },
    [changeFloor, goOutside, navigate, say],
  );

  const handleCharacterTapped = useCallback(() => {
    say(CHARACTER_CHATTER[Math.floor(Math.random() * CHARACTER_CHATTER.length)]);
  }, [say]);

  const handleFailed = useCallback(() => setIsRoomFailed(true), []);

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

  const nearbyFurniture = nearbyId ? findHouseFurniture(floor, nearbyId) : undefined;
  const nearbyButton = nearbyFurniture ? getFurnitureButton(nearbyFurniture) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: HOUSE_ROOM_BACKGROUND }}>
      {/*
        iOS 26 からは、画面のどこから右へスワイプしても前の画面へ戻るのが既定になった。
        スティックで右へ歩かせるドラッグが戻る操作に取られ、町へ戻されてしまうので、
        我が家タウン（RpgHubScreen、Issue #371）と同じく、戻るスワイプは画面の左端から始めたときだけにする
      */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false, headerShown: false }} />
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="mx-4 mt-2 rounded-2xl bg-white/90 px-4 py-3">
          <Text className="text-lg font-bold text-slate-900">{HOUSE_ROOMS[floor].title}</Text>
        </View>

        {/* 部屋のまわりのどこをドラッグしても、我が家タウンと同じスティックが出る。
            部屋は横長なので横長の枠に映し、上下の余りを均等にして画面の縦の真ん中に置く */}
        <WebVirtualPad onInputChange={handleStickInput}>
          <View className="flex-1 justify-center px-4">
            <View style={{ aspectRatio: ROOM_VIEW_ASPECT }}>
              <HouseRoomView
                ref={roomRef}
                active={isFocused}
                floor={floor}
                look={look}
                onCharacterTapped={handleCharacterTapped}
                onFailed={handleFailed}
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
          {isRoomFailed ? (
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
