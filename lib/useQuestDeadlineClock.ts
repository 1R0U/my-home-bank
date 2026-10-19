import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { questDeadlineTime } from "./questDeadline";
import type { Quest } from "../types";

/** 残り時間を毎分・期限ちょうど・前面復帰時に更新する。サーバーの再取得は行わない。 */
export function useQuestDeadlineClock(quests: Quest[]): number {
  const [now, setNow] = useState(Date.now);
  const deadlineKey = quests.map(questDeadlineTime).filter((time) => time !== null).join(",");

  useEffect(() => {
    if (!deadlineKey) return;
    const deadlines = deadlineKey.split(",").map(Number);
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const future = deadlines.filter((deadline) => deadline > current);
      if (future.length) {
        timer = setTimeout(refresh, Math.min(60_000, ...future.map((deadline) => deadline - current)));
      }
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [deadlineKey]);

  return now;
}
