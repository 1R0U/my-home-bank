import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHouseLayout, saveHouseLayout } from "./houseLayoutService";
import { loadHouseLayout } from "./houseLayoutStorage";
import { DEFAULT_HOUSE_LAYOUT, type HouseLayout } from "./rpg-hub/houseLayout";
import { useResource } from "./useResource";
import { useCurrentUser, useDataAccess } from "../store";

/**
 * 家の中の配置（もようがえ）を読み、変えたら保存する（Issue #244）。
 *
 * 元は端末の中だけに保存していた（Issue #425）が、他の家族の家の中を見られるように
 * するため、サーバー（`house_layouts`）へ移した。端末に残っていた配置は、まだDBに
 * 保存していない人だけ、初回に一度だけDBへ送って引き継ぐ（移行後は端末側を使わない）。
 *
 * @param viewedOwnerId - 他の家族の家を見るときの持ち主の `users.id`。省略すると自分の家
 * @returns `layout` は読み込みが終わるまで null。`updateLayout` は自分の家のときだけ渡る
 *   （他人の家を見ているときは undefined。見るだけで動かせない）
 */
export function useHouseLayout(viewedOwnerId?: string): {
  /** 自分の家かどうか（移行中でも変わらない。見出しなど「誰の家か」の表示に使う） */
  isOwn: boolean;
  layout: HouseLayout | null;
  updateLayout: ((next: HouseLayout) => void) | undefined;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const ownerId = viewedOwnerId ?? currentUser?.id;
  const isOwn = !viewedOwnerId || viewedOwnerId === currentUser?.id;
  // 移行を試すのは1回だけ（保存先の応答を待つ間に効果が重ねて走らないように）
  const migratingRef = useRef(false);
  // 移行の確認・保存が終わるまでは、もようがえをさせない（CodeRabbitレビュー指摘：
  // 移行の保存が終わる前に本人が家具を置いて保存すると、あとから終わった移行の
  // upsertが、本人の最新の配置を古い端末の配置で上書きしてしまう）
  const [isMigrating, setIsMigrating] = useState(false);

  const { data, hasData, isLive, reload, updateData } = useResource({
    key: canUseRealData && ownerId ? ["house-layout", ownerId] : null,
    fetcher: () => fetchHouseLayout(ownerId as string),
    initialData: null as HouseLayout | null,
    preview: DEFAULT_HOUSE_LAYOUT,
    errorMessage: "家の中の配置を読み込めませんでした",
  });

  // 自分の家で、DBにまだ行が無いと確認できたときだけ、端末に残っている配置を送る
  useEffect(() => {
    if (!isOwn || !isLive || !hasData || data !== null || !ownerId || migratingRef.current) return;
    migratingRef.current = true;
    setIsMigrating(true);
    loadHouseLayout(ownerId)
      .then((legacy) => {
        // 端末に何も残っていない（保存したことが無い）ときの既定値は、DB側の既定と同じなので送る価値が無い
        if (JSON.stringify(legacy) === JSON.stringify(DEFAULT_HOUSE_LAYOUT)) return;
        return saveHouseLayout(ownerId, legacy).then(() => reload());
      })
      .catch((error: unknown) => {
        console.warn("家の中の配置を移行できませんでした", error);
        migratingRef.current = false; // 次に開いたときにまた試す
      })
      .finally(() => setIsMigrating(false));
  }, [data, hasData, isLive, isOwn, ownerId, reload]);

  const updateLayout = useCallback(
    (next: HouseLayout) => {
      if (!ownerId) return;
      // 保存の応答を待たず、すぐに表示へ反映する（もようがえの操作感のため）
      updateData(() => next);
      saveHouseLayout(ownerId, next)
        .then(() => reload())
        .catch((error: unknown) => {
          console.warn("家の中の配置を保存できませんでした", error);
        });
    },
    [ownerId, reload, updateData],
  );

  const layout = !isLive ? data : hasData ? data ?? DEFAULT_HOUSE_LAYOUT : null;
  return { isOwn, layout, updateLayout: isOwn && isLive && !isMigrating ? updateLayout : undefined };
}
