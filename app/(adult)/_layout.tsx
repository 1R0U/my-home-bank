import { Ionicons } from "@expo/vector-icons";
import { Slot, Tabs } from "expo-router";
import { ADULT_NAV_ITEMS } from "../../constants/adultNav";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR } from "../../constants/ui";
import { useActiveRole } from "../../store";
import TutorialTabButton from "../../components/tutorial/TutorialTabButton";

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
      // 既定（"firstRoute"）だと、設定（タブに出さないhref: null、Issue #320）を
      // 開いている間にAndroidの戻るボタンを押すと、直前の画面ではなく先頭のタブ
      // （経済）へ飛んでしまう。履歴順に戻るようにする（1R0Uレビュー対応）。
      backBehavior="history"
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
            tabBarIcon: ({ color, size }) => <Ionicons color={color} name={icon} size={size} />,
            title: label,
          }}
        />
      ))}
      {/* 設定はタブに出さない（Issue #320）。href: null にしないと、明示していない
          ファイルとしてExpo Routerが自動でタブへ足してしまう。ホーム画面から
          router.push("/settings-adult") で開く、このグループ内のルートとしては残す。
          子供用の設定は別の画面（/settings-child、Issue #439）。 */}
      <Tabs.Screen name="settings-adult" options={{ href: null }} />
    </Tabs>
  );
}
