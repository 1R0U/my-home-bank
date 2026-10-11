import { useMemo } from "react";
import { DEFAULT_CHARACTER_TYPE } from "./rpg-hub/characterTypes";
import { getPortraitKey, type PortraitLook } from "./rpg-hub/portraitBridge";
import { useCurrentUser, useDataAccess } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { useWardrobeStore } from "../store/wardrobeStore";

/**
 * 今の利用者のキャラクターの見た目を、**もう読み込んである分だけ**から返す（Issue #261）。
 *
 * `useCharacterAppearance` / `useCharacterPalette` / `useWardrobe` と違い、**取得しに行かない。**
 * 読み込み中の画面（`WalkingCharacter`）は移動のたびに新しく出るので、そのたびに取り直すと、
 * 入った先の画面の読み込みと通信を取り合ってしまうため（PR #411 レビュー対応）。
 * 町の画面で同じフックがすでに動いているので、移動の時点ではふつう読み込み済みになっている。
 *
 * 読み込み済みかの判定は、上の3つのフックの `isReady` と同じ条件にしてある。
 * 途中の値（読み込み前の何も着ていない姿や、前の利用者の姿）では描かないため。
 * @returns 見た目。3種類のどれかがまだ読み込まれていなければ null
 */
export function useLoadedCharacterLook(): PortraitLook | null {
  const userId = useCurrentUser()?.id;
  const { canUseRealData } = useDataAccess();
  const characterType = useAppearanceStore((state) => state.characterType);
  const characterTypeLoadedFor = useAppearanceStore((state) => state.characterTypeLoadedFor);
  const palette = useAppearanceStore((state) => state.palette);
  const paletteLoadedFor = useAppearanceStore((state) => state.paletteLoadedFor);
  const paletteLoadedCharacterType = useAppearanceStore((state) => state.paletteLoadedCharacterType);
  const equipment = useWardrobeStore((state) => state.equipment);
  const equipmentLoadedFor = useWardrobeStore((state) => state.equipmentLoadedFor);
  const season = useMapStore((state) => state.currentSeason);

  // 実データを読まない（未ログイン・モック）ときは null を対象にする（3つのフックと同じ）
  const targetLoadedFor = canUseRealData && userId ? userId : null;
  const targetCharacterType = canUseRealData ? characterType : DEFAULT_CHARACTER_TYPE;
  const isReady =
    characterTypeLoadedFor === targetLoadedFor &&
    paletteLoadedFor === targetLoadedFor &&
    paletteLoadedCharacterType === targetCharacterType &&
    equipmentLoadedFor === targetLoadedFor;

  const key = isReady ? getPortraitKey({ characterType, equipment, palette, season }) : null;
  return useMemo<PortraitLook | null>(
    () => (key ? { characterType, equipment, palette, season } : null),
    // key が同じなら中身も同じ（getPortraitKey の約束）。見た目が同じ間は同じオブジェクトを返し、
    // 受け取った側が同じ見た目の描き直しを頼まないようにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}
