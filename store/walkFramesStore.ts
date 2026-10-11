import { create } from "zustand";
import type { WalkFrames } from "../lib/rpg-hub/walkFramesCache";

/**
 * 読み込み中の画面に出す、歩きのコマ絵（Issue #261）を覚えておく。
 *
 * コマ絵は見えない WebView で3Dを描いて作るので、できるまでに数秒かかる。
 * 我が家タウンと建物を行き来するたびに描き直さないよう、アプリを開いている間はここに残す
 * （アプリを閉じても残すぶんは lib/walkFramesFile.ts）。
 * 覚えておくのは最後の1組だけ。1組で数百KBあり、ふつうは1人の姿しか出さないため。
 */
type WalkFramesStore = {
  walkFrames: WalkFrames | null;
  /** 描いた（または読み込んだ）コマ絵を覚える */
  setWalkFrames: (walkFrames: WalkFrames) => void;
};

export const useWalkFramesStore = create<WalkFramesStore>((set) => ({
  walkFrames: null,
  setWalkFrames: (walkFrames) => set({ walkFrames }),
}));
