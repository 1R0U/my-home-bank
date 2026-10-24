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
 * いまの利用者が、その機能を使えるか（Issue #348）。
 * - `open`: 使える
 * - `closed`: 親が使わないにしている
 * - `loading`: 設定を読み込み中で、まだ分からない
 * - `unknown`: 設定を読み込めず、分からない
 *
 * **分からないときは閉じる（フェイルクローズ）。** 親が「使わせない」ために決める設定なので、
 * 通信エラーで開いてしまうと親の意図に反する。困るのは通信が不安定な間だけで、再試行で戻れる。
 * ただし一度読み込めた設定があれば、取り直しに失敗してもその設定で決める。
 */
export type FeatureAccess = "closed" | "loading" | "open" | "unknown";

/**
 * いまの利用者が、その機能を使えるかを決める。制限は子供だけにかかるので、親はいつも使える。
 * 実データを使わないとき（モックアカウント・プレビュー）は制限が無いものとして扱う。
 * @param state - 家族の「使わない」の一覧と、その読み込みの状態
 * @param user - いまの利用者。分からなければ null
 * @param role - いまのロール。未確定なら undefined
 * @param feature - 機能
 * @returns 使えるか
 */
export function getFeatureAccess(
  state: {
    error: string | null;
    hasData: boolean;
    isLive: boolean;
    restrictions: readonly ChildFeatureRestrictionRow[];
  },
  user: { id: string } | null | undefined,
  role: UserRole | undefined,
  feature: ChildFeature,
): FeatureAccess {
  if (role !== "child" || !user || !state.isLive) return "open";
  if (state.hasData) return isChildFeatureEnabled(state.restrictions, user.id, feature) ? "open" : "closed";
  return state.error ? "unknown" : "loading";
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

/** 使えるか分からない（設定を読み込めない）ときに出す言葉。再試行のボタンと一緒に出す */
export const UNKNOWN_FEATURE_LINES: Record<ChildFeature, readonly string[]> = {
  bank: ["{銀行|ぎんこう}が つかえるか たしかめられなかったよ。", "もういちど ためしてね。"],
};

/** 使えるかを読み込んでいる間に、町で建物に入ろうとしたときに出す言葉 */
export const LOADING_FEATURE_LINES: Record<ChildFeature, readonly string[]> = {
  bank: ["{銀行|ぎんこう}を じゅんびしているよ。", "すこし まってから はいってね。"],
};

/**
 * 使わない機能の建物で、使い方の案内（チュートリアル）の手順を飛ばすためのID。
 * 建物へ向かう手順と、建物の中の手順の両方を進める。進めないと、入れない建物の前で案内が止まる。
 */
export const CLOSED_FEATURE_TUTORIAL_STEPS: Record<ChildFeature, readonly string[]> = {
  bank: ["town-bank", "child-bank-back"],
};
