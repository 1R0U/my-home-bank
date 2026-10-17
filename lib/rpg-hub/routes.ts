import type { Href } from "expo-router";
import type { MapRouteId } from "../../types/map";
import type { UserRole } from "../../types";

/**
 * 画面遷移ではなくテレポートで処理する route（Issue #444）。
 *
 * 自分の家の中は、町と同じ3Dシーンの中の、町から離れた場所にある。町の家（house）と
 * 家の中の玄関（exit）の間は、テレポートで行き来する。
 * 値は着く先の建物の route で、その建物の「出口」（扉の前）に立たせる。
 *
 * `RpgHubScreen.tsx` の `handleTeleportRoute` と、2D比較画面（`ChildHomeScreen2D.tsx`）が
 * 「テレポート系のタップは無視する」判定に、同じ一覧として共有する。
 */
export const TELEPORT_DESTINATIONS: Readonly<Partial<Record<MapRouteId, MapRouteId>>> = {
  exit: "house",
  house: "exit",
};

/** テレポートで処理する route の一覧（`TELEPORT_DESTINATIONS` に行き先があるもの） */
export const TELEPORT_ROUTES: ReadonlySet<MapRouteId> = new Set(Object.keys(TELEPORT_DESTINATIONS) as MapRouteId[]);

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
    // 自分の家の出入りは画面遷移ではなくテレポートで行う（RpgHubScreen.tsx）。
    // exit と house の値は表を満たすためだけの未使用のフォールバック（Issue #444）
    exit: "/rpg-hub",
    history: "/history",
    house: "/rpg-hub",
    store: "/store-child",
    tasks: "/tasks-child",
    wardrobe: "/wardrobe",
  },
  parent: {
    bank: "/bank",
    board: "/notifications",
    exit: "/rpg-hub",
    history: "/history",
    house: "/rpg-hub",
    store: "/store-adult",
    tasks: "/tasks-adult",
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

/**
 * 建物に近づいたときに出すボタンの言葉（`Furigana` にそのまま渡せる `{漢字|よみ}` 形式）。
 *
 * ふつうの建物は「入る」。掲示板は中へ入る建物ではないので「見る」（Issue #354）。
 * 家の中の家具は、押すと何が起きるかが分かる言葉にする（真横から見ていた家の中と同じ。Issue #444）。
 * @param routeId - 建物が指す行き先の種類
 * @returns ボタンの言葉
 */
export function getInteractLabel(routeId: MapRouteId): string {
  if (routeId === "board") return "{見|み}る";
  if (routeId === "exit") return "そとへ でる";
  if (routeId === "wardrobe") return "きがえる";
  return "{入|はい}る";
}
