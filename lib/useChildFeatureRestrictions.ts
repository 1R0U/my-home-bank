import type { ChildFeature } from "../types/index";
import { useActiveRole, useCurrentUser, useDataAccess } from "../store";
import { canUseFeature, type ChildFeatureRestrictionRow } from "./childFeatures";
import { fetchChildFeatureRestrictions } from "./childFeatureService";
import { useResource } from "./useResource";

/**
 * 家族の子供ごとの「使わない」にした機能を取得する（Issue #348）。
 *
 * 親の設定画面（切り替え）と、子供が入口を使うときの判定（`useFeatureAvailable`）の両方で使う。
 * 同じキーなので、町で取ったものを銀行の画面でも共有する。
 * モックアカウントでは取得しない（制限は無いものとして扱う）。
 */
export function useChildFeatureRestrictions(): {
  restrictions: ChildFeatureRestrictionRow[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => Promise<void>;
  updateData: (updater: (data: ChildFeatureRestrictionRow[]) => ChildFeatureRestrictionRow[]) => void;
} {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const familyId = currentUser?.family_id;

  const { data, error, isLive, loading, reload, updateData } = useResource<ChildFeatureRestrictionRow[]>({
    blockedReason: familyId ? null : "所属する家族が設定されていません",
    errorMessage: "子供ごとの機能の設定を取得できませんでした",
    fetcher: () => fetchChildFeatureRestrictions(familyId as string),
    initialData: [],
    key: canUseRealData ? ["childFeatureRestrictions", familyId ?? null, currentUser?.id ?? null] : null,
  });

  return { error, isLive, loading, reload, restrictions: data, updateData };
}

/**
 * いまの利用者が、その機能を使えるか。親はいつも使える。
 * 取得前・取得に失敗したときは使えるとして扱う（分からないまま入口を閉じない）。
 * @param feature - 機能
 * @returns 使えるなら true
 */
export function useFeatureAvailable(feature: ChildFeature): boolean {
  const user = useCurrentUser();
  const role = useActiveRole();
  const { restrictions } = useChildFeatureRestrictions();
  return canUseFeature(restrictions, user, role, feature);
}
