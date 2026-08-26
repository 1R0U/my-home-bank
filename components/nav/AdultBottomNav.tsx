import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { Pressable, Text, View } from "react-native";

export type AdultNavKey = "loan" | "store" | "home" | "tasks" | "history" | "settings";

type NavItem = {
  key: AdultNavKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route: Href;
};

const NAV_ITEMS: NavItem[] = [
  { key: "loan", label: "ローン", icon: "cash-outline", route: "/loan-adult" },
  { key: "store", label: "ストア", icon: "storefront-outline", route: "/store-adult" },
  { key: "home", label: "ホーム", icon: "home-outline", route: "/main-adult" },
  { key: "tasks", label: "タスク", icon: "list-outline", route: "/tasks-adult" },
  { key: "history", label: "履歴", icon: "time-outline", route: "/history" },
  { key: "settings", label: "設定", icon: "settings-outline", route: "/settings" },
];

type AdultBottomNavProps = {
  activeKey: AdultNavKey | null;
};

export default function AdultBottomNav({ activeKey }: AdultBottomNavProps) {
  return (
    <View className="flex-row border-t border-slate-200 bg-white px-2 pt-2">
      {NAV_ITEMS.map((item) => {
        const active = item.key === activeKey;

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-1 items-center py-1"
            key={item.key}
            onPress={() => {
              if (!active) {
                router.replace(item.route);
              }
            }}
          >
            <Ionicons color={active ? "#2563eb" : "#94a3b8"} name={item.icon} size={22} />
            <Text
              className={`mt-1 text-[11px] font-medium ${
                active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
