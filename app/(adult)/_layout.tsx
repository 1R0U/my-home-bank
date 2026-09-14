import { Ionicons } from "@expo/vector-icons";
import { Slot, Tabs } from "expo-router";
import { useActiveRole } from "../../store";

const TAB_ACTIVE_COLOR = "#2563eb";
const TAB_INACTIVE_COLOR = "#94a3b8";

const TABS: {
  name: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { icon: "cash-outline", name: "loan-adult", title: "ローン" },
  { icon: "storefront-outline", name: "store-adult", title: "ストア" },
  { icon: "home-outline", name: "main-adult", title: "ホーム" },
  { icon: "list-outline", name: "tasks-adult", title: "タスク" },
  { icon: "time-outline", name: "history", title: "履歴" },
  { icon: "settings-outline", name: "settings", title: "設定" },
];

export default function AdultTabsLayout() {
  const role = useActiveRole();

  // 履歴・設定は子供からも直接遷移してくる共有画面。子供アクセス時は大人用の
  // タブバーを表示せず、画面本体だけを描画する。
  // 起動直後などロールが確定するまでは undefined になり得るため、その間は
  // タブバーを消さずに Tabs のまま表示する（"child" と確定した場合のみ Slot にする）。
  if (role === "child") {
    return <Slot />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name={icon} size={size} />,
            title,
          }}
        />
      ))}
    </Tabs>
  );
}
