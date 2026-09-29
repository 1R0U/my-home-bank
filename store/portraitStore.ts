import { create } from "zustand";

/**
 * 描いたキャラクターの肖像（Issue #306）を、見た目のキーごとに覚えておく。
 *
 * 肖像は見えない WebView で3Dを描いて作るので、1枚に1〜2秒かかる。ホーム画面と
 * 設定画面を行き来するたびに描き直さないよう、アプリを開いている間はここに残す。
 * キーは `getPortraitKey`（lib/rpg-hub/portraitBridge.ts）で、見た目が1か所でも
 * 変われば別のキーになる。
 *
 * **覚えておくのは最近の数枚だけ。** 着せ替えを何度も試すと枚数が増え続けるため。
 * 画像は data URL の文字列で、1枚あたり数十KBほど。
 */
type PortraitStore = {
  /** キー → 画像（PNG の data URL）。古い順に並ぶ */
  images: Record<string, string>;
  /** 描いた画像を覚える */
  setImage: (key: string, dataUrl: string) => void;
};

/** 覚えておく枚数の上限。 */
export const MAX_PORTRAIT_IMAGES = 8;

export const usePortraitStore = create<PortraitStore>((set) => ({
  images: {},
  setImage: (key, dataUrl) =>
    set((state) => {
      if (state.images[key] === dataUrl) return {};
      // 同じキーは入れ直して「最近使った」側へ寄せる。上限を超えたら古いものから捨てる
      const entries = Object.entries(state.images).filter((entry) => entry[0] !== key);
      entries.push([key, dataUrl]);
      return { images: Object.fromEntries(entries.slice(-MAX_PORTRAIT_IMAGES)) };
    }),
}));
