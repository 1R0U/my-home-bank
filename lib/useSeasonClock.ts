import { useEffect } from "react";
import { AppState } from "react-native";
import { useMapStore } from "../store/mapStore";
import { msUntilNextSeason } from "./rpg-hub/season";

/**
 * タイマーの待ち時間の上限（6時間）。
 *
 * 次の季節まで数か月あることもあるが、setTimeout は約24.8日を超えると
 * すぐに発火してしまう。また、端末の時計を手で変えられた場合にも、
 * ずれたまま何か月も待たないようにするため、長くても数時間ごとに決め直す。
 */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/**
 * 変わり目ちょうどに起きると、端末の時計の誤差でまだ前の季節と判定されることがある。
 * 少しだけ遅らせて起きる。
 */
const WAKE_MARGIN_MS = 1000;

/**
 * アプリを開いたまま季節の変わり目をまたいでも、季節が切り替わるようにする（Issue #282）。
 *
 * 次の季節の始まりに合わせてタイマーを掛け、起きたら `refreshSeason` で決め直す。
 * バックグラウンドの間はタイマーが止まることがあるので、アプリが前面へ戻ったときにも決め直す。
 * 季節を表示する画面（RPGハブ）で呼ぶ。
 */
export function useSeasonClock(): void {
  const refreshSeason = useMapStore((state) => state.refreshSeason);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refreshAndSchedule = () => {
      if (timer !== null) clearTimeout(timer);
      const now = new Date();
      refreshSeason(now);
      const wait = Math.min(msUntilNextSeason(now) + WAKE_MARGIN_MS, MAX_WAIT_MS);
      timer = setTimeout(refreshAndSchedule, wait);
    };

    refreshAndSchedule();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAndSchedule();
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
      subscription.remove();
    };
  }, [refreshSeason]);
}
