import { Ionicons } from "@expo/vector-icons";
import { Slot, Tabs } from "expo-router";
import { useActiveRole } from "../../store";

const TAB_ACTIVE_COLOR = "#2563eb";
const TAB_INACTIVE_COLOR = "#94a3b8";

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
      <Tabs.Screen
        name="loan-adult"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="cash-outline" size={size} />,
          title: "ローン",
        }}
      />
      <Tabs.Screen
        name="store-adult"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="storefront-outline" size={size} />,
          title: "ストア",
        }}
      />
      <Tabs.Screen
        name="main-adult"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="home-outline" size={size} />,
          title: "ホーム",
        }}
      />
      <Tabs.Screen
        name="tasks-adult"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="list-outline" size={size} />,
          title: "タスク",
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="time-outline" size={size} />,
          title: "履歴",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="settings-outline" size={size} />,
          title: "設定",
        }}
      />
    </Tabs>
  );
}
