import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS } from "../../constants/ui";
import { TUTORIAL_STEPS } from "../../lib/tutorial";
import { CHILD_THEME } from "../childTheme";
import Furigana from "../Furigana";
import { useTutorial } from "./TutorialContext";

/** 説明は画面の下に場所を確保する。ボタン・入力欄・町の操作を覆わない。 */
export default function TutorialGuide() {
  const tutorial = useTutorial();
  const path = usePathname();
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(120, height * 0.4);
  if (!tutorial) return null;
  const { role, mode, step, storageError } = tutorial;
  const homePath = role === "parent" ? "/main-adult" : "/rpg-hub";
  if (mode === "idle" && !storageError) return null;
  if (mode === "offer" && path !== homePath) return null;
  const child = role === "child";
  const offer = mode === "offer";
  const done = step?.id === "done";
  const title = offer ? (child ? "おうちギルドへ ようこそ！" : "おうちギルドの使い方") : step?.title;
  const text = offer
    ? (child ? "いっしょに{町|まち}を{歩|ある}いてみよう！ {枠|わく}のボタンを{押|お}しながら、{使|つか}い{方|かた}を{覚|おぼ}えられるよ。" : "実際の画面のボタンを押しながら、タスク・ストア・経済の使い方を確認できます。")
    : step?.text;
  const startOver = () => {
    tutorial.start();
    router.replace(homePath);
  };
  const actions = [
    ...(offer ? [{ label: child ? "はじめる" : "案内をはじめる", onPress: tutorial.start }] : []),
    ...(done ? [{ label: child ? "おわる" : "案内を終える", onPress: tutorial.stop }] : []),
    ...(mode === "running" && !done ? [{ label: child ? "はじめから" : "はじめから案内", onPress: startOver }] : []),
    ...(mode !== "idle" && !done ? [{ label: child ? "あとでみる" : "案内を閉じる", onPress: tutorial.stop }] : []),
    ...(storageError ? [{ label: child ? "ほぞんをやりなおす" : "表示履歴の保存を再試行", onPress: tutorial.retrySave }] : []),
  ];

  if (child) return (
    <SafeAreaView edges={["bottom"]} style={styles.panel}>
      <ScrollView style={{ flexGrow: 0, maxHeight: panelHeight }}>
      <View style={styles.content}>
        {title && <View accessibilityLiveRegion="polite"><Furigana accessibilityRole="header" style={styles.title}>
          {`${mode === "running" ? `${tutorial.index + 1}/${TUTORIAL_STEPS.child.length}　` : ""}${title}`}
        </Furigana></View>}
        {text && <Furigana style={styles.text}>{text}</Furigana>}
        {storageError && <Furigana style={styles.text}>{"{案内|あんない}の{表示|ひょうじ}{履歴|りれき}を{保存|ほぞん}できなかったよ。{次|つぎ}に{開|ひら}くとまた{表示|ひょうじ}されることがあるよ。"}</Furigana>}
        <View style={styles.actions}>
          {actions.map((action) => <Pressable accessibilityRole="button" key={action.label} onPress={action.onPress} style={styles.button}>
            <Text style={styles.buttonText}>{action.label}</Text>
          </Pressable>)}
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView edges={["bottom"]} className="border-t-2 border-blue-600 bg-white">
      <ScrollView style={{ flexGrow: 0, maxHeight: panelHeight }}>
      <View className="gap-2 px-4 py-3">
        {title && <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-base font-bold text-slate-900">
          {mode === "running" ? `${tutorial.index + 1}/${TUTORIAL_STEPS.parent.length}　` : ""}{title}
        </Text>}
        {text && <Text className="text-sm leading-5 text-slate-700">{text}</Text>}
        {storageError && <Text className={`text-sm ${ERROR_TEXT_CLASS}`}>表示履歴を保存できませんでした。次回も案内が表示される場合があります。</Text>}
        <View className="flex-row flex-wrap gap-2">
          {actions.map((action) => <Pressable accessibilityRole="button" className="rounded-xl bg-blue-600 px-4 py-3" key={action.label} onPress={action.onPress}>
            <Text className="text-sm font-semibold text-white">{action.label}</Text>
          </Pressable>)}
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: CHILD_THEME.parchment, borderTopWidth: 3, borderColor: CHILD_THEME.gold },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  title: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "bold" },
  text: { color: CHILD_THEME.darkWood, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: CHILD_THEME.darkWood, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "bold" },
});
