import { Ionicons } from "@expo/vector-icons";
import { Slot, Tabs } from "expo-router";
import { ADULT_NAV_ITEMS } from "../../constants/adultNav";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR } from "../../constants/ui";
import { useActiveRole } from "../../store";
import TutorialTabButton from "../../components/tutorial/TutorialTabButton";
import { tutorialScreenLayout } from "../../components/tutorial/useTutorialNavigationLock";

export default function AdultTabsLayout() {
  const role = useActiveRole();

  // 履歴（Issue #438）・設定（Issue #439）も子供用を分けたので、子供が来る共有画面は今は無いが、
  // 子供が大人用の画面を開いたときに備えて残す。子供アクセス時は大人用の
  // タブバーを表示せず、画面本体だけを描画する。
  // 起動直後などロールが確定するまでは undefined になり得るため、その間は
  // タブバーを消さずに Tabs のまま表示する（"child" と確定した場合のみ Slot にする）。
  if (role === "child") {
    return <Slot />;
  }

  return (
    <Tabs
      // SDK 58の型では id が必須扱いになってしまう（本来は省略可）。使わないので undefined を渡す
      id={undefined}
      screenLayout={tutorialScreenLayout}
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
            tabBarButton: (props) => <TutorialTabButton {...props} tutorialId={`nav-${name}`} />,
            tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name={icon} size={size} />,
            title: label,
          }}
        />
      ))}
      {/* 設定（Issue #320）はこのグループに置かない。ルート直下の Stack 画面（app/settings-adult.tsx）
          にしている。グループ内のファイルは Expo Router が自動でタブへ足すため、隠しタブにすると
          SDK の更新のたびに「開けない」（#485）・「タブがずれる」（#498）が起きていた。 */}
    </Tabs>
  );
}
