import { jest } from "@jest/globals";
import { userEvent } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";

/**
 * ボタンを押す。押したときの処理（Promise）の完了は待たない。
 *
 * RNTL v14 の `fireEvent.press` は、押したときの処理が返す Promise が終わるまで待つ。
 * 送信中・保存中の画面（二重送信の防止など）を確かめるテストでは、処理をわざと止めておくので、
 * `await fireEvent.press` では止まったままになる（Issue #493）。
 *
 * `userEvent.press` は押す・離すの各イベントを act の中で順に起こし、処理の完了は待たない。
 * 無効なボタンを押しても処理が走らないのは fireEvent と同じ。
 */
export async function pressWithoutWaiting(element: TestInstance): Promise<void> {
  // userEvent は押してから離すまでを setTimeout で待つので、偽のタイマーのときは進める
  const fakeTimers = "clock" in globalThis.setTimeout;
  await userEvent.setup({ advanceTimers: fakeTimers ? (ms) => jest.advanceTimersByTime(ms) : undefined }).press(element);
}
