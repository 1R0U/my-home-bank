import { useCurrentUser, useDataAccess } from "../store";
import { fetchOwnedStoreAssets } from "./storeService";
import { STORE_ASSETS, type OwnedStoreAsset } from "./storeAssets";
import { useResource } from "./useResource";

const EMPTY: OwnedStoreAsset[] = [];
const PREVIEW = STORE_ASSETS.map((asset) => ({ asset_id: asset.id, quantity: 1 }));

export function useOwnedStoreAssets() {
  const user = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  return useResource({
    key: canUseRealData && user ? ["ownedStoreAssets", user.id] : null,
    fetcher: () => fetchOwnedStoreAssets(user.id),
    initialData: EMPTY,
    preview: PREVIEW,
    errorMessage: "持ち物を取得できませんでした",
  });
}
