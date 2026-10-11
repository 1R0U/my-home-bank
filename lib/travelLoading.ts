// 我が家タウンから建物へ入るときに出す「いどうちゅう」の画面（Issue #261）を、いつ閉じるかの計算。
//
// 画面の出し入れ（store/travelStore.ts・components/TravelLoadingOverlay.tsx）から切り離し、
// React に依存しない純粋関数として置いて `node --test` で確かめる。

/**
 * 最低限見せる時間（ミリ秒）。
 * 入った先の画面がすぐ用意できても、この間は出しておく。一瞬だけ出て消えると、
 * 歩く姿も文字も読めず、画面がちらついたようにしか見えないため。
 */
export const TRAVEL_MIN_MS = 700;

/**
 * 最長で見せる時間（ミリ秒）。
 * 入った先の画面の読み込みが終わらなくても、ここで閉じる。この画面は全体を覆っていて
 * 戻るボタンも押せないので、通信が止まったときに閉じ込めないようにするため。
 * 閉じた後は、入った先の画面がそれぞれの読み込み中の表示・エラーを出す。
 */
export const TRAVEL_MAX_MS = 8000;

/** 移動1回ぶんの状態。 */
export type Travel = {
  /** 何回目の移動か。前の移動の後始末が、次の移動を閉じてしまわないよう見分ける */
  id: number;
  /** 移動を始めた時刻（ミリ秒） */
  startedAt: number;
  /** 入った先の画面が、まだ読み込み中だと知らせているか */
  waiting: boolean;
};

/**
 * 移動中の画面を、あと何ミリ秒で閉じるかを求める。
 *
 * 入った先の画面が読み込み中なら最長の時間まで待ち、そうでなければ最低限の時間で閉じる。
 * 読み込み中を知らせない画面（知らせる仕組みを入れていない画面）も、最低限の時間で閉じる。
 * @param travel - 移動の状態
 * @param now - 今の時刻（ミリ秒）
 * @returns 閉じるまでのミリ秒。0なら今すぐ閉じる
 */
export function getTravelHideDelay(travel: Travel, now: number): number {
  const elapsed = now - travel.startedAt;
  const limit = travel.waiting ? TRAVEL_MAX_MS : TRAVEL_MIN_MS;
  return Math.max(0, limit - elapsed);
}
