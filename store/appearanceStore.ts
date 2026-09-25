import { create } from "zustand";
import { PALETTE_SLOTS, type Palette } from "../lib/rpg-hub/palette";
import { DEFAULT_CHARACTER_TYPE, type CharacterType } from "../lib/rpg-hub/characterTypes";

/**
 * ログイン中の本人のキャラクターの見た目（Issue #254 / #287）。
 *
 * 色（`palette`）と種類（`characterType`、カエル以外の候補。#287）を持つ。
 * RPGハブ画面がこれを読んで、プレイヤーの見た目に反映する。
 *
 * **色（palette）のDBからの読み込みはまだ無い。** 選んで保存する仕組みは #253 で作る。
 * それまでは空のままなので、プレイヤーは既定の色で表示される。
 *
 * **種類（characterType）は `useCharacterAppearance`（#287）がDBから読み込む。**
 * `useWardrobe` と同じく利用者が変わったら取得を待たずに既定へ戻すこと（前の人の種類を残さない）。
 */
type AppearanceStore = {
  /** 枠ごとの色。空なら既定の色 */
  palette: Palette;
  /** 読み込み結果を反映する */
  setPalette: (palette: Palette) => void;
  /** キャラクターの種類。読み込み前・未選択は既定（frog） */
  characterType: CharacterType;
  /**
   * `characterType` が「どの利用者について確定済みか」（PR #290レビュー対応）。
   *
   * 実利用者のIDなら、その人について読み込み・保存が終わっている（取得失敗時に
   * 既定へ戻した場合も含む）。`null` は「未ログイン、またはモックアカウントで
   * 既定のまま確定している」ことを表す（読み込み自体をしないため）。
   *
   * 画面側（`useCharacterAppearance` の `isReady`）はこれと今の利用者IDを比べ、
   * 一致するまで `characterType` を使わない。比べずに使うと、切り替え直後は
   * 前の利用者の種類のままシーンが組まれてしまう。
   */
  characterTypeLoadedFor: string | null;
  /** 読み込み・保存の結果を反映する。loadedForは対象の利用者ID（未ログイン・モックはnull） */
  setCharacterType: (characterType: CharacterType, loadedFor: string | null) => void;
};

/**
 * 色の指定が同じかどうかを判定する。
 * @param a - 比較する指定
 * @param b - 比較する指定
 * @returns すべての枠が同じなら true
 */
function isSamePalette(a: Palette, b: Palette): boolean {
  return PALETTE_SLOTS.every((slot) => a[slot] === b[slot]);
}

export const useAppearanceStore = create<AppearanceStore>((set) => ({
  palette: {},
  setPalette: (palette) =>
    set((state) =>
      // 中身が同じなら参照を変えない。変えると画面側の effect が同じ色を送り直す
      // （wardrobeStore の setWardrobe と同じ理由）。
      isSamePalette(state.palette, palette) ? {} : { palette },
    ),
  characterType: DEFAULT_CHARACTER_TYPE,
  characterTypeLoadedFor: null,
  setCharacterType: (characterType, loadedFor) =>
    set((state) =>
      state.characterType === characterType && state.characterTypeLoadedFor === loadedFor
        ? {}
        : { characterType, characterTypeLoadedFor: loadedFor },
    ),
}));
