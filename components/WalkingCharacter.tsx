import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { PortraitRenderer } from "./rpg-hub-web/PortraitRenderer";
import { TRAVEL_CHARACTER_SIZE, TRAVEL_LOADING_COLORS, travelLoadingStyles } from "./travelLoadingStyles";
import {
  WALK_FRAME_COUNT,
  getPortraitKey,
  getWalkFramesKey,
  type PortraitLook,
} from "../lib/rpg-hub/portraitBridge";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { loadWalkFrames, saveWalkFrames } from "../lib/walkFramesFile";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { usePortraitStore } from "../store/portraitStore";
import { useWalkFramesStore } from "../store/walkFramesStore";
import { useWardrobeStore } from "../store/wardrobeStore";

/**
 * 1コマを出す時間（ミリ秒）。8コマで約0.9秒＝左右1歩ずつ。
 * 町でプレイヤーが歩くときと同じくらいの足の運びにしてある。
 */
export const WALK_FRAME_INTERVAL_MS = 110;

/** コマ絵ができるまでの代わりの姿を弾ませる周期（ミリ秒）。1歩ぶん */
const FALLBACK_STEP_MS = WALK_FRAME_INTERVAL_MS * (WALK_FRAME_COUNT / 2);

/** 代わりの姿を弾ませる高さ */
const FALLBACK_BOB_HEIGHT = 8;

/**
 * 自分のキャラクターが、その場で歩いている姿を出す（Issue #261）。読み込み中の画面の真ん中に置く。
 *
 * **我が家タウンで見る姿そのものが、町と同じ手足の振り方で歩く。** 種類・色・装備を町と同じ
 * データから読み、見えない WebView（`PortraitRenderer` の歩きモード）で歩く動作1周ぶんの
 * コマ絵を描いて、順に切り替えて見せる。
 *
 * コマ絵は描くのに数秒かかるので、一度描いたものはアプリを開いている間（`useWalkFramesStore`）と、
 * 次に開いたとき用にファイル（`lib/walkFramesFile.ts`）に残す。できるまでは、ホームのアイコンと
 * 同じ肖像（描いてあれば）か人型のアイコンを、歩く調子で弾ませて代わりに出す。
 */
export default function WalkingCharacter() {
  const { isReady: isTypeReady } = useCharacterAppearance();
  const { isReady: isPaletteReady } = useCharacterPalette();
  const { isReady: isWardrobeReady } = useWardrobe();
  const characterType = useAppearanceStore((state) => state.characterType);
  const palette = useAppearanceStore((state) => state.palette);
  const equipment = useWardrobeStore((state) => state.equipment);
  const season = useMapStore((state) => state.currentSeason);
  // 3種類の読み込みがすべて終わるまでは描かない。途中の値で描くと、すぐ描き直すことになる
  // （CharacterAvatar と同じ理由）
  const isReady = isTypeReady && isPaletteReady && isWardrobeReady;

  const portraitKey = isReady ? getPortraitKey({ characterType, equipment, palette, season }) : null;
  const look = useMemo<PortraitLook | null>(
    () => (portraitKey ? { characterType, equipment, palette, season } : null),
    // portraitKey が同じなら中身も同じ（getPortraitKey の約束）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portraitKey],
  );
  const walkKey = look ? getWalkFramesKey(look) : null;

  const walkFrames = useWalkFramesStore((state) => state.walkFrames);
  const setWalkFrames = useWalkFramesStore((state) => state.setWalkFrames);
  const frames = walkKey !== null && walkFrames?.key === walkKey ? walkFrames.frames : null;
  const portrait = usePortraitStore((state) => (portraitKey ? state.images[portraitKey] : undefined));

  // ファイルに残したコマ絵を確かめ終えた見た目。確かめ終えるまでは描かない
  // （残っていれば描かずに済むので、ほかの読み込みと同時に3Dを動かさないため）
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  // 描くのに失敗した見た目は、この画面にいる間はもう頼まない（失敗し続けて重くならないように）
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const hasFrames = frames !== null;

  useEffect(() => {
    if (walkKey === null || hasFrames) return;
    let cancelled = false;
    loadWalkFrames()
      .then((saved) => {
        if (cancelled) return;
        if (saved?.key === walkKey) setWalkFrames(saved);
        setCheckedKey(walkKey);
      })
      .catch((error: unknown) => {
        console.warn("残しておいた歩く姿を読めませんでした", error);
        if (!cancelled) setCheckedKey(walkKey);
      });
    return () => {
      cancelled = true;
    };
  }, [hasFrames, setWalkFrames, walkKey]);

  const handleRendered = useCallback(
    (key: string, rendered: string[]) => {
      // 描いている間に見た目が変わっていたら、前の見た目のコマ絵は使わない
      if (key !== walkKey) return;
      const next = { frames: rendered, key };
      setWalkFrames(next);
      try {
        saveWalkFrames(next);
      } catch (error) {
        // 残せなくても今は出せる。次にアプリを開いたとき描き直すだけ
        console.warn("歩く姿をファイルに残せませんでした", error);
      }
    },
    [setWalkFrames, walkKey],
  );
  const handleError = useCallback(
    (message: string) => {
      console.warn("歩く姿を描けませんでした", message);
      setFailedKey(walkKey);
    },
    [walkKey],
  );

  const shouldRender = look !== null && !hasFrames && checkedKey === walkKey && failedKey !== walkKey;

  return (
    <View style={travelLoadingStyles.character}>
      {frames ? <WalkFrames frames={frames} /> : <FallbackWalker portrait={portrait} />}
      {shouldRender ? (
        <PortraitRenderer look={look} onError={handleError} onRendered={handleRendered} variant="walk" />
      ) : null}
    </View>
  );
}

/**
 * コマ絵を順に切り替えて、歩いて見せる。
 *
 * 全部のコマを重ねて置き、見せるコマ以外を透明にする。1枚の `<Image>` の画像を
 * 差し替えると、端末によっては切り替えのたびに読み直して、ちらついて見えるため。
 */
function WalkFrames({ frames }: { frames: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, WALK_FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [frames.length]);

  return (
    <>
      {frames.map((frame, frameIndex) => (
        <Image
          // コマの並びは見た目ごとに決まっていて、並べ替えは起きない
          key={frameIndex}
          resizeMode="contain"
          source={{ uri: frame }}
          style={[travelLoadingStyles.frame, { opacity: frameIndex === index ? 1 : 0 }]}
          testID={frameIndex === index ? "walking-character-frame" : undefined}
        />
      ))}
    </>
  );
}

/**
 * コマ絵ができるまでの代わり。肖像（あれば）か人型のアイコンを、歩く調子で弾ませる。
 * @param portrait - ホームのアイコンと同じ肖像。まだ描いていなければ undefined
 */
function FallbackWalker({ portrait }: { portrait: string | undefined }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          duration: FALLBACK_STEP_MS / 2,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          duration: FALLBACK_STEP_MS / 2,
          easing: Easing.in(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -FALLBACK_BOB_HEIGHT] });

  return (
    <Animated.View style={[travelLoadingStyles.fallback, { transform: [{ translateY }] }]}>
      {portrait ? (
        <Image
          resizeMode="contain"
          source={{ uri: portrait }}
          style={travelLoadingStyles.character}
          testID="walking-character-portrait"
        />
      ) : (
        <Ionicons
          color={TRAVEL_LOADING_COLORS.fallbackIcon}
          name="walk"
          size={Math.round(TRAVEL_CHARACTER_SIZE * 0.5)}
          testID="walking-character-icon"
        />
      )}
    </Animated.View>
  );
}
