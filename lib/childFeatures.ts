import type { ChildFeature, UserRole } from "../types/index";
import type { MapRouteId } from "../types/map";

/**
 * 子供ごとに使う・使わないを切り替えられる機能（Issue #348）。
 *
 * 切り替えるのは親だけ（設定画面の「子供ごとの機能」）。使わないにした機能は
 * `child_feature_restrictions` に1行ずつ入り、行が無ければ使える。
 * 機能を増やすときは、`ChildFeature` の型・この一覧・マイグレーションの `feature` の制約をそろえて足す。
 */

/** 設定画面に並べる機能。`description` は親向けに、使わないにすると何が起きるかを書く */
export const CHILD_FEATURES: readonly { id: ChildFeature; label: string; description: string }[] = [
  {
    description: "オフにすると、町の銀行に入れなくなります（預入・引き出し・借入・自動積立預金）",
    id: "bank",
    label: "銀行",
  },
];

/** `child_feature_restrictions` から取り出す行（だれが・どの機能を使わないか） */
export type ChildFeatureRestrictionRow = { user_id: string; feature: ChildFeature };

/**
 * その子供がその機能を使えるか。
 * @param restrictions - 家族の「使わない」の一覧
 * @param userId - 子供のid
 * @param feature - 機能
 * @returns 使えるなら true（行が無ければ使える）
 */
export function isChildFeatureEnabled(
  restrictions: readonly ChildFeatureRestrictionRow[],
  userId: string,
  feature: ChildFeature,
): boolean {
  return !restrictions.some((row) => row.user_id === userId && row.feature === feature);
}

/**
 * いまの利用者がその機能を使えるか。制限は子供だけにかかるので、親はいつも使える。
 * ロールが未確定のとき・利用者が分からないときも止めない（分からないまま入口を閉じない）。
 * @param restrictions - 家族の「使わない」の一覧
 * @param user - いまの利用者。分からなければ null
 * @param role - いまのロール。未確定なら undefined
 * @param feature - 機能
 * @returns 使えるなら true
 */
export function canUseFeature(
  restrictions: readonly ChildFeatureRestrictionRow[],
  user: { id: string } | null | undefined,
  role: UserRole | undefined,
  feature: ChildFeature,
): boolean {
  if (role !== "child" || !user) return true;
  return isChildFeatureEnabled(restrictions, user.id, feature);
}

/** 町の建物の行き先（route）が、どの機能に当たるか。当たらない建物はいつでも入れる */
const ROUTE_FEATURES: Readonly<Partial<Record<MapRouteId, ChildFeature>>> = {
  bank: "bank",
};

/**
 * 町の建物の行き先が当たる機能。
 * @param route - 建物の行き先
 * @returns 機能。切り替えの対象でない建物なら null
 */
export function getRouteFeature(route: MapRouteId): ChildFeature | null {
  return ROUTE_FEATURES[route] ?? null;
}

/**
 * 使わない機能の建物に入ろうとしたときに出す言葉（`Furigana` にそのまま渡せる形式）。
 * 建物は町に残したまま、入れないことだけを伝える（Issue #348 で確認）。
 */
export const CLOSED_FEATURE_LINES: Record<ChildFeature, readonly string[]> = {
  bank: ["{銀行|ぎんこう}は いま しまっているよ。", "つかいたいときは おとなに きいてみてね。"],
};

/**
 * 使わない機能の建物で、使い方の案内（チュートリアル）の手順を飛ばすためのID。
 * 建物へ向かう手順と、建物の中の手順の両方を進める。進めないと、入れない建物の前で案内が止まる。
 */
export const CLOSED_FEATURE_TUTORIAL_STEPS: Record<ChildFeature, readonly string[]> = {
  bank: ["town-bank", "child-bank-back"],
};
