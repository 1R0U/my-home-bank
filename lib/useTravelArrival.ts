import { useEffect, useRef } from "react";
import { useTravelStore } from "../store/travelStore";

/**
 * 我が家タウンから入ってくる建物の画面で、読み込みの具合を「いどうちゅう」の画面に知らせる（Issue #261）。
 *
 * 読み込み中の間は「いどうちゅう」の画面が出たままになり、終わると（最低限の時間を見せた後で）閉じる。
 * 町を通らずに開いたとき（大人のホームのボタンなど）は移動していないので、何もしない。
 *
 * **移動を始めた後に開いた画面だけが知らせる。** 大人のタブのように前から裏で開いたままの画面が
 * 「読み込み済み」と知らせて、入った先がまだ読み込み中なのに閉じてしまわないようにするため。
 * @param isReady - 画面の中身を出せるところまで読み込めたか
 */
export function useTravelArrival(isReady: boolean): void {
  const mountedAtRef = useRef<number | null>(null);
  if (mountedAtRef.current === null) mountedAtRef.current = Date.now();
  const mountedAt = mountedAtRef.current;

  const travelId = useTravelStore((state) =>
    state.travel && state.travel.startedAt <= mountedAt ? state.travel.id : null,
  );
  const setWaiting = useTravelStore((state) => state.setWaiting);

  useEffect(() => {
    if (travelId !== null) setWaiting(travelId, !isReady);
  }, [isReady, setWaiting, travelId]);
}
