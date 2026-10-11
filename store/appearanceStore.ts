import { create } from "zustand";
import { PALETTE_SLOTS, type Palette } from "../lib/rpg-hub/palette";
import { DEFAULT_CHARACTER_TYPE, type CharacterType } from "../lib/rpg-hub/characterTypes";

/**
 * ログイン中の本人のキャラクターの見た目（Issue #254 / #287）。
 *
 * 色（`palette`）と種類（`characterType`、カエル以外の候補。#287）を持つ。
 * RPGハブ画面がこれを読んで、プレイヤーの見た目に反映する。
 *
 * **色（palette）は `useCharacterPalette`（#253）がDBから読み込む。**
 * 「どの利用者と種類について確定済みか」（`paletteLoadedFor` / `paletteLoadedCharacterType`）を持たせて
 * いる。単純に「利用者が変わったら消す」effectだけだと、①別の画面がマウントされた
 * 一瞬だけ前の利用者の色が残る、②新規マウント時（前の人の画面が既に無い状態で新しい
 * 人の画面が最初から開く場合）は消すべき前の色が既にストアに残っていても検知できない、
 * という2つの穴がある（PR #296レビュー対応）。
 *
 * **種類（characterType）は `useCharacterAppearance`（#287）がDBから読み込む。**
 * `useWardrobe` と同じく利用者が変わったら取得を待たずに既定へ戻すこと（前の人の種類を残さない）。
 */
type AppearanceStore = {
  /** 枠ごとの色。空なら既定の色 */
  palette: Palette;
  /**
   * `palette` が「どの利用者について確定済みか」。`characterTypeLoadedFor` と同じ考え方。
   *
   * 実利用者のIDなら、その人について読み込み・保存が終わっている（取得失敗時に
   * 既定へ戻した場合も含む）。`null` は「未ログイン、またはモックアカウントで
   * 既定のまま確定している」ことを表す（読み込み自体をしないため）。
   *
   * 画面側（`useCharacterPalette` の `isReady`）はこれと今の利用者IDを比べ、一致する
   * までは `palette` を使わない（3Dシーンへ送らない）。比べずに使うと、切り替え直後や
   * 新規マウント直後に前の利用者の色が一瞬シーンへ送られてしまう。
   */
  paletteLoadedFor: string | null;
  /** paletteが確定しているキャラクター種類。利用者IDだけでなく、種類も一致させてから使う */
  paletteLoadedCharacterType: CharacterType;
  /** 読み込み・保存の対象となった利用者IDと種類を、色と同時に反映する */
  setPalette: (palette: Palette, loadedFor: string | null, characterType: CharacterType) => void;
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
  paletteLoadedFor: null,
  paletteLoadedCharacterType: DEFAULT_CHARACTER_TYPE,
  setPalette: (palette, loadedFor, characterType) =>
    set((state) =>
      // 中身が同じなら参照を変えない。変えると画面側の effect が同じ色を送り直す
      // （wardrobeStore の setWardrobe と同じ理由）。
      isSamePalette(state.palette, palette) && state.paletteLoadedFor === loadedFor &&
        state.paletteLoadedCharacterType === characterType
        ? {}
        : { palette, paletteLoadedFor: loadedFor, paletteLoadedCharacterType: characterType },
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
