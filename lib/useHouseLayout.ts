import { useCallback, useEffect, useState } from "react";
import { loadHouseLayout, saveHouseLayout } from "./houseLayoutStorage";
import { DEFAULT_HOUSE_LAYOUT, type HouseLayout } from "./rpg-hub/houseLayout";
import { useCurrentUser } from "../store";

/** 未ログインで家に入ったときの保存先 */
const GUEST_OWNER_KEY = "guest";

/**
 * 家の中の配置（もようがえ）を読み、変えたら保存する（Issue #425）。
 *
 * サーバーのデータではなく端末の中に保存するので、useResource は使わない（lib/houseLayoutStorage.ts）。
 * @returns layout は読み込みが終わるまで null。updateLayout で変えると、すぐ表示に反映して保存する
 */
export function useHouseLayout(): { layout: HouseLayout | null; updateLayout: (next: HouseLayout) => void } {
  const ownerKey = useCurrentUser()?.id ?? GUEST_OWNER_KEY;
  const [state, setState] = useState<{ layout: HouseLayout; ownerKey: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHouseLayout(ownerKey)
      .catch((error: unknown) => {
        console.warn("家の中の配置を読めませんでした", error);
        return DEFAULT_HOUSE_LAYOUT;
      })
      .then((layout) => {
        if (!cancelled) setState({ layout, ownerKey });
      });
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  const updateLayout = useCallback(
    (next: HouseLayout) => {
      setState({ layout: next, ownerKey });
      saveHouseLayout(ownerKey, next).catch((error: unknown) => {
        console.warn("家の中の配置を保存できませんでした", error);
      });
    },
    [ownerKey],
  );

  // 利用者が変わった直後は、前の利用者の配置を出さない
  return { layout: state?.ownerKey === ownerKey ? state.layout : null, updateLayout };
}
