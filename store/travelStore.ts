import { create } from "zustand";
import type { Travel } from "../lib/travelLoading";

/**
 * 我が家タウンから建物へ入るときの「いどうちゅう」の画面（Issue #261）を出しているか。
 *
 * 町（`RpgHubScreen`）が建物へ入るときに始め、入った先の画面が読み込みの具合を知らせ
 * （`useTravelArrival`）、画面全体に重ねた表示（`TravelLoadingOverlay`）が閉じる。
 * 建物から町へ戻るときは、町が始めて、扉の前へ立たせ直したら自分で知らせる。
 * 町と入った先の画面は別の画面なので、間をつなぐためにここに置く。
 */
type TravelStore = {
  /** 移動中の状態。移動していなければ null */
  travel: Travel | null;
  /**
   * 移動を始める。前の移動が残っていれば置き換える
   * @returns 始めた移動のID。行き先の画面の代わりに、始めた側が読み込みの具合を知らせるときに使う
   */
  startTravel: () => number;
  /**
   * 入った先の画面が読み込み中かを知らせる。
   * @param id - どの移動についての知らせか。もう終わった移動なら何もしない
   * @param waiting - まだ読み込み中か
   */
  setWaiting: (id: number, waiting: boolean) => void;
  /**
   * 移動を終える（画面を閉じる）。
   * @param id - どの移動を終えるか。省略すると今の移動を終える。違う移動なら何もしない
   */
  endTravel: (id?: number) => void;
};

let nextTravelId = 1;

export const useTravelStore = create<TravelStore>((set) => ({
  travel: null,
  startTravel: () => {
    const id = nextTravelId;
    nextTravelId += 1;
    set({ travel: { id, startedAt: Date.now(), waiting: null } });
    return id;
  },
  setWaiting: (id, waiting) =>
    set((state) => {
      if (state.travel?.id !== id || state.travel.waiting === waiting) return {};
      return { travel: { ...state.travel, waiting } };
    }),
  endTravel: (id) =>
    set((state) => {
      if (!state.travel || (id !== undefined && state.travel.id !== id)) return {};
      return { travel: null };
    }),
}));
