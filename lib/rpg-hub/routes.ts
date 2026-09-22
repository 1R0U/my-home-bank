import type { Href } from "expo-router";
import type { MapRouteId } from "../../types/map";
import type { UserRole } from "../../types";

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
    history: "/history",
    store: "/store-child",
    tasks: "/tasks-child",
  },
  parent: {
    bank: "/bank",
    history: "/history",
    store: "/store-adult",
    tasks: "/tasks-adult",
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
