import { useEffect } from "react";
import TravelLoadingScreen from "./TravelLoadingScreen";
import { getTravelHideDelay } from "../lib/travelLoading";
import { useTravelStore } from "../store/travelStore";

/**
 * 我が家タウンから建物へ入るときに、画面全体へ重ねて出す「いどうちゅう」の画面（Issue #261）。
 *
 * アプリ全体の layout（app/_layout.tsx）に1つだけ置く。町の画面から入った先の画面へ切り替わる
 * 間も途切れずに出し続けるため、どちらかの画面の中ではなく、その上に重ねる。
 *
 * 入った先の画面が読み込み中だと知らせている間（`useTravelArrival`）は出し続け、
 * 終わったら閉じる。閉じる時刻の決め方は lib/travelLoading.ts。
 */
export default function TravelLoadingOverlay() {
  const travel = useTravelStore((state) => state.travel);
  const endTravel = useTravelStore((state) => state.endTravel);

  useEffect(() => {
    if (!travel) return;
    const timer = setTimeout(() => endTravel(travel.id), getTravelHideDelay(travel, Date.now()));
    return () => clearTimeout(timer);
  }, [endTravel, travel]);

  if (!travel) return null;
  return <TravelLoadingScreen overlay />;
}
