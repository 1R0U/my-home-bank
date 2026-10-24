import { useCallback, useEffect, useMemo, useState } from "react";
import { getSelectableFinishes, type HouseFinishKind } from "../../lib/rpg-hub/houseFinishes";
import { useHouseFinishes } from "../../lib/useHouseFinishes";
import type { HouseFinishOptions } from "./DecorationMode";

type Options = {
  /** 編集モード中か。終えたら、保存できなかったときの理由を消す */
  editing: boolean;
  /** 家の中にいるか。町では壁紙・床板のタブを出さない */
  inHouse: boolean;
  ownedAssets: readonly { asset_id: string }[];
};

/**
 * かざるの「かべ」「ゆか」のタブに渡す、壁紙・床板の選択肢と操作（Issue #480）。
 * @param options - 編集中か・家の中か・持っている物
 * @returns タブに渡す内容（町では null）と、保存できなかったときの理由
 */
export function useHouseFinishOptions(options: Options): { error: string | null; finishes: HouseFinishOptions | null } {
  const { editing, inHouse, ownedAssets } = options;
  const { finishes: current, save } = useHouseFinishes();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setError(null);
  }, [editing]);

  const ownedIds = useMemo(() => ownedAssets.map((item) => item.asset_id), [ownedAssets]);
  const onSelect = useCallback(
    (kind: HouseFinishKind, id: string) => {
      setError(null);
      const next = kind === "wallpaper" ? { ...current, wallpaperId: id } : { ...current, flooringId: id };
      save(next).catch(() => setError(kind === "wallpaper" ? "かべを かえられませんでした" : "ゆかを かえられませんでした"));
    },
    [current, save],
  );

  const finishes = useMemo(
    () =>
      inHouse
        ? {
            current,
            flooring: getSelectableFinishes("flooring", ownedIds),
            onSelect,
            wallpaper: getSelectableFinishes("wallpaper", ownedIds),
          }
        : null,
    [current, inHouse, onSelect, ownedIds],
  );

  return { error, finishes };
}
