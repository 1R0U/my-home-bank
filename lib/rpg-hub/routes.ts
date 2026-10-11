import type { Href } from "expo-router";
import type { MapRouteId } from "../../types/map";
import type { UserRole } from "../../types";

/**
 * 画面遷移ではなくテレポートで処理する route（Issue #235）。
 *
 * 自分の家（house）は、家の中を別の画面（/my-house）にしたので画面遷移になった（Issue #386）。
 * 階段（upstairs / downstairs）は3Dの家の中にしか無く、今は町から行けない。
 *
 * `RpgHubScreen.tsx` の `handleTeleportRoute` と、2D比較画面（`ChildHomeScreen2D.tsx`）が
 * 「テレポート系のタップは無視する」判定に、同じ一覧として共有する（1R0Uさんレビュー指摘：
 * コンポーネント内で毎回 `new Set` していたのをモジュール定数へ）。
 */
export const TELEPORT_ROUTES: ReadonlySet<MapRouteId> = new Set(["upstairs", "downstairs"]);

/**
 * 建物の行き先を、いま町にいる人のロールごとにまとめた表（Issue #247）。
 *
 * **銀行と履歴は大人・子供で同じ画面**（`BankScreen` / `HistoryScreen` が中で
 * ロールを見ている）。分かれるのはタスクとストアだけで、子供用タスク画面は
 * 「自分が子供として報告する」画面なので、大人が入ると意味がねじれる。
 *
 * `Record<UserRole, Record<MapRouteId, Href>>` にしてあるので、**建物の種類を増やすと
 * 大人・子供の両方を埋めるまで型が通らない**。片方だけ足して、もう一方で
 * `undefined` へ遷移するのを防ぐため。
 */
export const MAP_ROUTES_BY_ROLE: Record<UserRole, Record<MapRouteId, Href>> = {
  child: {
    bank: "/bank",
    // 町の広場の掲示板。お知らせの一覧は大人・子供で同じ画面（Issue #354）
    board: "/notifications",
    // 3Dの家の中の階段の上り下りは画面遷移ではなくテレポートで行う
    // （RpgHubScreen.tsx）。この値は表を満たすためだけの未使用のフォールバック（Issue #235）
    downstairs: "/rpg-hub",
    history: "/history",
    // 家の中は別の画面（Issue #386）
    house: "/my-house",
    store: "/store-child",
    tasks: "/tasks-child",
    upstairs: "/rpg-hub",
    wardrobe: "/wardrobe",
  },
  parent: {
    bank: "/bank",
    board: "/notifications",
    downstairs: "/rpg-hub",
    history: "/history",
    house: "/my-house",
    store: "/store-adult",
    tasks: "/tasks-adult",
    upstairs: "/rpg-hub",
    wardrobe: "/wardrobe",
  },
};

/**
 * 建物の行き先を、入っている人のロールから決める。
 *
 * ロールが未確定（起動直後・未ログイン）のときは子供用を返す。RPGハブは子供のホームで、
 * 大人はホーム画面のボタンから入ってくる（＝そのときは必ずロールが決まっている）ため、
 * 分からないときに子供用へ寄せたほうが実際の見え方に近い。
 * @param routeId - 建物が指す行き先の種類
 * @param role - いま町にいる人のロール。未確定なら undefined
 * @returns 遷移先のパス
 */
export function resolveMapRoute(routeId: MapRouteId, role: UserRole | undefined): Href {
  return MAP_ROUTES_BY_ROLE[role === "parent" ? "parent" : "child"][routeId];
}
