import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { Image, View } from "react-native";
import { PortraitRenderer } from "./rpg-hub-web/PortraitRenderer";
import { CHARACTER_TYPE_LABELS, getAppliedPalette } from "../lib/rpg-hub/characterTypes";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { useCurrentUser } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { usePortraitStore } from "../store/portraitStore";
import { useWardrobeStore } from "../store/wardrobeStore";
import { MUTED_ICON_COLOR } from "../constants/ui";

type Props = {
  /** 丸の直径（React Native の長さの単位） */
  size: number;
};

/** 肖像が出るまでの人型アイコンの大きさ（丸の直径に対する割合）。今までの見た目に合わせてある */
const FALLBACK_ICON_RATIO = 0.5;

/**
 * ログイン中の本人のキャラクターを、丸いアイコンとして出す（Issue #306）。
 *
 * **我が家タウンで見る姿そのものを出す。** 種類（かえる・ねこ・ハムスター）・色・装備を
 * 町と同じデータ（`useCharacterAppearance` / `useCharacterPalette` / `useWardrobe`）から読み、
 * 町と同じ組み立て方で3Dを描いた画像を使う（描くのは `PortraitRenderer`）。
 *
 * 描き終わるまでは、今までの人型アイコンを出す。一度描いた画像は覚えておくので
 * （`usePortraitStore`）、見た目を変えない限り次からはすぐに出る。
 * 3種類の読み込みがすべて終わるまでは描かない。途中の値（読み込み前の何も着ていない姿や、
 * 前の利用者の姿）で描いてしまい、すぐ描き直すことになるため。
 */
export default function CharacterAvatar({ size }: Props) {
  const { isReady: isTypeReady } = useCharacterAppearance();
  const { isReady: isPaletteReady } = useCharacterPalette();
  const { isReady: isWardrobeReady } = useWardrobe();
  const characterType = useAppearanceStore((state) => state.characterType);
  const savedPalette = useAppearanceStore((state) => state.palette);
  // 保存した色はカエルにだけ当てる（我が家タウンと同じ判定。getAppliedPalette 参照）
  const palette = getAppliedPalette(characterType, savedPalette);
  const equipment = useWardrobeStore((state) => state.equipment);
  const season = useMapStore((state) => state.currentSeason);
  const isReady = isTypeReady && isPaletteReady && isWardrobeReady;

  // 見た目が同じ間は同じオブジェクトを使う。変わるたびに作り直すと、
  // PortraitRenderer が同じ見た目の描き直しを頼んでしまう
  const key = isReady ? getPortraitKey({ characterType, equipment, palette, season }) : null;
  const look = useMemo<PortraitLook | null>(
    () => (key ? { characterType, equipment, palette, season } : null),
    // key が同じなら中身も同じ（getPortraitKey の約束）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const images = usePortraitStore((state) => state.images);
  const setImage = usePortraitStore((state) => state.setImage);
  const image = key ? images[key] : undefined;

  // 描き直している間は、直前に出していた画像を出し続ける。
  // 着せ替えるたびに人型アイコンへ戻ると、ちらついて見えるため。
  // **ただし同じ人の画像に限る。** 利用者が切り替わったら、前の人の姿は出さない
  const userId = useCurrentUser()?.id ?? null;
  const lastImageRef = useRef<{ dataUrl: string; userId: string | null } | null>(null);
  if (image) lastImageRef.current = { dataUrl: image, userId };
  const shownImage =
    image ?? (lastImageRef.current?.userId === userId ? lastImageRef.current.dataUrl : undefined);

  // 描くのに失敗した見た目は、同じ画面にいる間はもう頼まない（失敗し続けて重くならないように）
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const handleRendered = useCallback(
    (renderedKey: string, dataUrl: string) => setImage(renderedKey, dataUrl),
    [setImage],
  );
  const handleError = useCallback(
    (message: string) => {
      console.warn("キャラクターのアイコンを描けませんでした", message);
      setFailedKey(key);
    },
    [key],
  );

  const shouldRender = look !== null && !image && failedKey !== key;
  const label = `自分のキャラクター（${CHARACTER_TYPE_LABELS[characterType]}）`;

  return (
    <View
      accessible
      accessibilityLabel={shownImage ? label : "自分のキャラクター"}
      accessibilityRole="image"
      className="items-center justify-center overflow-hidden rounded-full bg-slate-200"
      style={{ height: size, width: size }}
    >
      {shownImage ? (
        <Image
          resizeMode="contain"
          source={{ uri: shownImage }}
          style={{ height: size, width: size }}
          testID="character-avatar-image"
        />
      ) : (
        <Ionicons color={MUTED_ICON_COLOR} name="person" size={Math.round(size * FALLBACK_ICON_RATIO)} />
      )}
      {shouldRender ? (
        <PortraitRenderer look={look} onError={handleError} onRendered={handleRendered} />
      ) : null}
    </View>
  );
}
