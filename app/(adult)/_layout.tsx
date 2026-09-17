import { Ionicons } from "@expo/vector-icons";
import { Slot, Tabs } from "expo-router";
import { ADULT_NAV_ITEMS } from "../../constants/adultNav";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR } from "../../constants/ui";
import { useActiveRole } from "../../store";

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
        tabBarActiveTintColor: ACTIVE_ICON_COLOR,
        tabBarInactiveTintColor: MUTED_ICON_COLOR,
      }}
    >
      {ADULT_NAV_ITEMS.map(({ name, label, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name={icon} size={size} />,
            title: label,
          }}
        />
      ))}
    </Tabs>
  );
}
