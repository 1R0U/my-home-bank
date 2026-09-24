import { create } from "zustand";
import { PALETTE_SLOTS, type Palette } from "../lib/rpg-hub/palette";

/**
 * ログイン中の本人のキャラクターの見た目（Issue #254）。
 *
 * いまは色（`palette`）だけを持つ。RPGハブ画面がこれを WebView へ送り、プレイヤーの色にする。
 *
 * **DBからの読み込みはまだ無い。** 見た目を選んで保存する仕組みは #253 で作る。それまでは
 * 空のままなので、プレイヤーは既定の色で表示される。#253 で読み込みを足すときは、
 * `useWardrobe` と同じく利用者が変わったら取得を待たずに空へ戻すこと（前の人の色を残さない）。
 */
type AppearanceStore = {
  /** 枠ごとの色。空なら既定の色 */
  palette: Palette;
  /** 読み込み結果を反映する */
  setPalette: (palette: Palette) => void;
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
}));
