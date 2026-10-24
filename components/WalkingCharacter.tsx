import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { PortraitRenderer } from "./rpg-hub-web/PortraitRenderer";
import { TRAVEL_CHARACTER_SIZE, TRAVEL_LOADING_COLORS, travelLoadingStyles } from "./travelLoadingStyles";
import {
  WALK_FRAME_COUNT,
  getPortraitKey,
  getWalkFramesKey,
  type PortraitLook,
} from "../lib/rpg-hub/portraitBridge";
import { useLoadedCharacterLook } from "../lib/useLoadedCharacterLook";
import { loadWalkFrames, saveWalkFrames } from "../lib/walkFramesFile";
import { usePortraitStore } from "../store/portraitStore";
import { useWalkFramesStore } from "../store/walkFramesStore";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCurrentUser, useDataAccess } from "../store";
import { DEFAULT_CHARACTER_TYPE, type CharacterType } from "../lib/rpg-hub/characterTypes";
import { TRAVEL_CHARACTER_IMAGES } from "../constants/travelCharacters";

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
 * 今の見た目の歩きのコマ絵を、覚えているもの（アプリを開いている間）か、
 * ファイルに残したもの（前にアプリを開いたとき）から探す。**描きはしない。**
 * @param look - キャラクターの見た目。まだ読み込まれていなければ null
 * @returns 見つかったコマ絵と、ファイルを確かめ終えたか
 */
function useStoredWalkFrames(look: PortraitLook | null): { checked: boolean; frames: string[] | null } {
  const walkKey = look ? getWalkFramesKey(look) : null;
  const walkFrames = useWalkFramesStore((state) => state.walkFrames);
  const setWalkFrames = useWalkFramesStore((state) => state.setWalkFrames);
  const frames = walkKey !== null && walkFrames?.key === walkKey ? walkFrames.frames : null;
  const hasFrames = frames !== null;
  // ファイルを確かめ終えた見た目
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

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

  return { checked: walkKey !== null && checkedKey === walkKey, frames };
}

/**
 * 自分のキャラクターが、その場で歩いている姿を出す（Issue #261）。読み込み中の画面の真ん中に置く。
 *
 * **我が家タウンで見る姿そのものが、町と同じ手足の振り方で歩く。** コマ絵は町の画面の裏で
 * 描いておく（`WalkFramesPreparer`）。ここでは描かない。読み込み中の画面が出ているのは
 * 町のシーンや入った先の画面を読み込んでいる最中で、そこへ3Dをもう1つ動かすと、
 * かえって読み込みが遅くなるため（PR #411 レビュー対応）。
 *
 * コマ絵がまだ無いときは、残した肖像か、同梱した同じ種類の姿を弾ませて出す。
 * 種類も未確定の間だけ人型のアイコンにする。
 * @param active - 歩かせるか。見えないように置いてあるだけの間は止めて、画像だけ読み込んでおく
 */
export default function WalkingCharacter({ active = true }: { active?: boolean }) {
  const look = useLoadedCharacterLook();
  const { frames } = useStoredWalkFrames(look);
  const [failedFrames, setFailedFrames] = useState<string[] | null>(null);
  const portraitKey = look ? getPortraitKey(look) : null;
  const portrait = usePortraitStore((state) => (portraitKey ? state.images[portraitKey] : undefined));
  const characterType = useAppearanceStore((state) => state.characterType);
  const typeLoadedFor = useAppearanceStore((state) => state.characterTypeLoadedFor);
  const userId = useCurrentUser()?.id;
  const { canUseRealData } = useDataAccess();
  // 色・装備の取得や画像生成が終わる前でも、確定済みの種類の姿を出す。
  // 利用者が変わった直後は、前の人の種類を使わない。
  const fallbackType = canUseRealData
    ? typeLoadedFor === userId ? characterType : null
    : DEFAULT_CHARACTER_TYPE;
  const fallback = <FallbackWalker active={active} characterType={fallbackType} portrait={portrait} />;

  return (
    <View style={travelLoadingStyles.character}>
      {frames && frames !== failedFrames ? (
        <WalkFrames key={look ? getWalkFramesKey(look) : undefined} active={active} frames={frames}
          fallback={fallback} onError={() => setFailedFrames(frames)} />
      ) : (
        fallback
      )}
    </View>
  );
}

/**
 * 読み込み中の画面に出す歩きのコマ絵を、まだ無ければ見えないところで描いておく（Issue #261）。
 *
 * 町の画面（`RpgHubScreen`）が、シーンの準備ができた後に置く。読み込み中の画面の中で描くと、
 * 町のシーンと同時に3Dを2つ立ち上げることになり、建物へ入るときはすぐ閉じて描き終わる前に
 * 捨てられてしまうため（PR #411 レビュー対応）。
 *
 * 一度描いたものはアプリを開いている間（`useWalkFramesStore`）と、次に開いたとき用に
 * ファイル（`lib/walkFramesFile.ts`）に残す。ファイルにあれば描かない。
 */
export function WalkFramesPreparer() {
  const look = useLoadedCharacterLook();
  const walkKey = look ? getWalkFramesKey(look) : null;
  const { checked, frames } = useStoredWalkFrames(look);
  const setWalkFrames = useWalkFramesStore((state) => state.setWalkFrames);
  // 描くのに失敗した見た目は、この画面にいる間はもう頼まない（失敗し続けて重くならないように）
  const [failedKey, setFailedKey] = useState<string | null>(null);

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

  if (look === null || frames !== null || !checked || failedKey === walkKey) return null;
  return <PortraitRenderer look={look} onError={handleError} onRendered={handleRendered} variant="walk" />;
}

/**
 * コマ絵を順に切り替えて、歩いて見せる。
 *
 * 全部のコマを重ねて置き、見せるコマ以外を透明にする。1枚の `<Image>` の画像を
 * 差し替えると、端末によっては切り替えのたびに読み直して、ちらついて見えるため。
 */
function WalkFrames({ active, frames, fallback, onError }: {
  active: boolean; frames: string[]; fallback: ReactNode; onError: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const isLoaded = frames.every((frame) => loaded.has(frame));
  useEffect(() => {
    if (!active || !isLoaded) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, WALK_FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, frames.length, isLoaded]);

  return (
    <>
      {!isLoaded && fallback}
      {frames.map((frame, frameIndex) => (
        <Image
          // コマの並びは見た目ごとに決まっていて、並べ替えは起きない
          key={frameIndex}
          resizeMode="contain"
          source={{ uri: frame }}
          onLoad={() => setLoaded((previous) => new Set(previous).add(frame))}
          onError={onError}
          style={[travelLoadingStyles.frame, { opacity: isLoaded && frameIndex === index ? 1 : 0 }]}
          testID={isLoaded && frameIndex === index ? "walking-character-frame" : "walking-character-preload"}
        />
      ))}
    </>
  );
}

/**
 * コマ絵ができるまでの代わり。肖像か同梱画像を、歩く調子で弾ませる。
 * @param active - 弾ませるか
 * @param characterType - 確定済みの種類。まだ確定していなければ null
 * @param portrait - ホームのアイコンと同じ肖像。まだ描いていなければ undefined
 */
function FallbackWalker({ active, characterType, portrait }: {
  active: boolean;
  characterType: CharacterType | null;
  portrait: string | undefined;
}) {
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const [loadedPortrait, setLoadedPortrait] = useState<string | null>(null);
  const shownPortrait = portrait && portrait !== failedPortrait ? portrait : undefined;
  const isPortraitLoaded = shownPortrait && loadedPortrait === shownPortrait;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      bob.setValue(0);
      return;
    }
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
  }, [active, bob]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -FALLBACK_BOB_HEIGHT] });

  return (
    <Animated.View style={[travelLoadingStyles.fallback, { transform: [{ translateY }] }]}>
      {!isPortraitLoaded && (characterType ? (
        <Image resizeMode="contain" source={TRAVEL_CHARACTER_IMAGES[characterType]}
          style={travelLoadingStyles.character} testID="walking-character-default" />
      ) : (
        <Ionicons color={TRAVEL_LOADING_COLORS.fallbackIcon} name="walk"
          size={Math.round(TRAVEL_CHARACTER_SIZE * 0.5)} testID="walking-character-icon" />
      ))}
      {shownPortrait && (
        <Image
          resizeMode="contain"
          source={{ uri: shownPortrait }}
          onLoad={() => setLoadedPortrait(shownPortrait)}
          onError={() => setFailedPortrait(shownPortrait)}
          style={[travelLoadingStyles.character, travelLoadingStyles.frame, { opacity: isPortraitLoaded ? 1 : 0 }]}
          testID={isPortraitLoaded ? "walking-character-portrait" : "walking-character-portrait-loading"}
        />
      )}
    </Animated.View>
  );
}
