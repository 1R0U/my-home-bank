import type { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";

export type AdultNavItem = {
  // Tabs.Screen の name（ルートファイル名。(adult)グループからの相対パス）
  name: string;
  // router.push/replace 等で使うフルパス
  href: Href;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

/**
 * 大人用の主要6画面。(adult)タブグループのタブ定義（app/(adult)/_layout.tsx）と、
 * タブ外画面（所持金画面等）からの簡易ナビゲーション（ParentBalanceScreen）の
 * 両方でこの1つの定義を共有する。
 */
export const ADULT_NAV_ITEMS: AdultNavItem[] = [
  { href: "/loan-adult", icon: "cash-outline", label: "ローン", name: "loan-adult" },
  { href: "/store-adult", icon: "storefront-outline", label: "ストア", name: "store-adult" },
  { href: "/main-adult", icon: "home-outline", label: "ホーム", name: "main-adult" },
  { href: "/tasks-adult", icon: "list-outline", label: "タスク", name: "tasks-adult" },
  { href: "/history", icon: "time-outline", label: "履歴", name: "history" },
  { href: "/settings", icon: "settings-outline", label: "設定", name: "settings" },
];
