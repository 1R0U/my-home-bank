import { type Href, router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS } from "../../constants/ui";
import { TUTORIAL_STEPS } from "../../lib/tutorial";
import { returnToTutorialScreen } from "../../lib/tutorialNavigation";
import { CHILD_THEME } from "../childTheme";
import Furigana from "../Furigana";
import { useTutorial } from "./TutorialContext";
import TutorialOffer from "./TutorialOffer";

/** 開始の選択は中央、開始後の説明は下に場所を確保して操作を覆わない。 */
export default function TutorialGuide() {
  const tutorial = useTutorial();
  const path = usePathname();
  const { height } = useWindowDimensions();
  if (!tutorial) return null;
  const { role, mode, step, storageError } = tutorial;
  const homePath = role === "parent" ? "/main-adult" : "/rpg-hub";
  if (mode === "idle" && !storageError) return null;
  if (mode === "offer" && path !== homePath) return null;
  const child = role === "child";
  const offer = mode === "offer";
  const panelHeight = Math.max(120, height * (offer ? 0.7 : 0.4));
  const done = step?.id === "done";
  const title = offer ? (child ? "おうちギルドへ ようこそ！" : "おうちギルドの使い方") : step?.title;
  const text = offer
    ? (child ? "いっしょに{町|まち}を{歩|ある}いてみよう！ {枠|わく}のボタンを{押|お}しながら、{使|つか}い{方|かた}を{覚|おぼ}えられるよ。" : "画面のボタンを押しながら、タスク・ストア・経済・履歴・ホーム・町・設定の使い方を確認します。説明を読む手順は「次へ」で進めます。案内をはじめますか？")
    : step?.text;
  const startOver = () => {
    tutorial.start();
    returnToTutorialScreen(homePath);
  };
  const actions = [
    ...(offer ? [{ label: child ? "はじめる" : "案内をはじめる", onPress: tutorial.start }] : []),
    ...(mode === "running" && step?.explanation ? [{
      label: path === step.explanation.path ? (step.explanation.nextLabel ?? "次へ") : "説明の画面へ戻る",
      onPress: () => {
        const explanation = step.explanation;
        if (path !== explanation.path) {
          returnToTutorialScreen(explanation.path as Href);
          return;
        }
        if (explanation.returnTo) returnToTutorialScreen(explanation.returnTo as Href);
        else if (explanation.nextRoute) router.push(explanation.nextRoute as Href);
        tutorial.advance(step.id);
      },
    }] : []),
    ...(done ? [{ label: child ? "おわる" : "案内を終える", onPress: tutorial.stop }] : []),
    ...(mode === "running" && !done ? [{ label: child ? "はじめから" : "はじめから案内", onPress: startOver }] : []),
    ...(mode !== "idle" && !done ? [{ label: child ? "あとでみる" : "案内を閉じる", onPress: tutorial.stop }] : []),
    ...(storageError ? [{ label: child ? "ほぞんをやりなおす" : "表示履歴の保存を再試行", onPress: tutorial.retrySave }] : []),
  ];

  const content = child ? (
    <SafeAreaView testID={offer ? "tutorial-offer-card" : "tutorial-guide"} edges={offer ? [] : ["bottom"]} style={[styles.panel, offer && styles.offerCard]}>
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
  ) : (
    <SafeAreaView testID={offer ? "tutorial-offer-card" : "tutorial-guide"} edges={offer ? [] : ["bottom"]} className={offer ? "rounded-2xl border-2 border-blue-600 bg-white" : "border-t-2 border-blue-600 bg-white"}>
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
  return offer ? <TutorialOffer child={child} onClose={tutorial.stop}>{content}</TutorialOffer> : content;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: CHILD_THEME.parchment, borderTopWidth: 3, borderColor: CHILD_THEME.gold },
  offerCard: { borderWidth: 3, borderRadius: 20, overflow: "hidden" },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  title: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "bold" },
  text: { color: CHILD_THEME.darkWood, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: CHILD_THEME.darkWood, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "bold" },
});
