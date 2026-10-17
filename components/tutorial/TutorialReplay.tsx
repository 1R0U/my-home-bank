import { type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FEATURE_TUTORIALS } from "../../lib/tutorialFeatures";
import { returnToTutorialScreen } from "../../lib/tutorialReturn";
import { type TutorialRole } from "../../lib/tutorial";
import Furigana from "../Furigana";
import { CHILD_THEME } from "../childTheme";
import { useTutorial } from "./TutorialContext";

/** 見直したい機能だけを選ぶ。家の案内は、町から家へ入ると再開する。 */
export default function TutorialReplay({ role }: { role: TutorialRole }) {
  const tutorial = useTutorial();
  const [open, setOpen] = useState(false);
  const child = role === "child";
  return <View className={child ? undefined : "mt-2 rounded-2xl bg-white px-5 py-4"} style={child ? styles.panel : undefined}>
    <Pressable accessibilityRole="button" accessibilityLabel="使い方をもう一度見る" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)}>
      <Furigana className={child ? undefined : "text-base font-semibold text-blue-600"} style={child ? styles.title : undefined}>{"{使|つか}い{方|かた}をもう{一度|いちど}{見|み}る"}</Furigana>
    </Pressable>
    {open && <View className={child ? undefined : "mt-3 gap-2"} style={child ? styles.list : undefined}>
      {FEATURE_TUTORIALS[role].map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.label.replace(/\{([^|]+)\|[^}]+\}/g, "$1")}の案内を見る`} className={child ? undefined : "rounded-xl bg-slate-100 px-4 py-3"} style={child ? styles.button : undefined} onPress={() => {
        tutorial?.start(item.id);
        setOpen(false);
        returnToTutorialScreen(item.path as Href);
      }}>
        <Furigana className={child ? undefined : "text-sm text-slate-700"} style={child ? styles.text : undefined}>{`${item.label}${item.id === "house" ? "（{町|まち}から{家|いえ}に{入|はい}ると{始|はじ}まります）" : ""}`}</Furigana>
      </Pressable>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginTop: 8, borderRadius: 16, backgroundColor: CHILD_THEME.parchment, paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 16, fontWeight: "600", color: CHILD_THEME.darkWood },
  list: { marginTop: 12, gap: 8 },
  button: { borderRadius: 12, borderWidth: 1, borderColor: CHILD_THEME.gold, paddingHorizontal: 16, paddingVertical: 12 },
  text: { fontSize: 14, color: CHILD_THEME.darkWood },
});
