import { type Href, router, usePathname } from "expo-router";
import { useContext, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext, SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS, UI_COLORS } from "../../constants/ui";
import { getFeatureTutorial } from "../../lib/tutorialFeatures";
import { getTutorialOverlayLayout } from "../../lib/tutorialOverlay";
import { returnToTutorialScreen } from "../../lib/tutorialReturn";
import { CHILD_THEME } from "../childTheme";
import Furigana from "../Furigana";
import { useTutorial } from "./TutorialContext";
import TutorialOffer from "./TutorialOffer";

/** 対象の周囲を暗くし、その近くで説明する。対象のない説明は中央に置く。 */
export default function TutorialGuide() {
  const tutorial = useTutorial();
  const path = usePathname();
  const window = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0 };
  const overlay = useRef<View>(null);
  const [bounds, setBounds] = useState({ x: 0, y: 0, width: window.width, height: window.height });
  const [panelHeight, setPanelHeight] = useState(260);
  if (!tutorial) return null;
  const { role, mode, step, storageError } = tutorial;
  const definition = tutorial.feature ? getFeatureTutorial(role, tutorial.feature) : undefined;
  const homePath = definition?.path ?? (role === "parent" ? "/main-adult" : "/rpg-hub");
  if (mode === "idle" && !storageError) return null;
  if (mode === "offer" && path !== homePath) return null;
  const child = role === "child";
  const offer = mode === "offer";
  const done = step?.id === "done";
  const target = !step?.explanation && !done ? tutorial.target : null;
  const rect = target?.rect ? { ...target.rect, x: target.rect.x - bounds.x, y: target.rect.y - bounds.y } : null;
  const layout = getTutorialOverlayLayout({ ...bounds, top: insets.top, bottom: insets.bottom }, rect, panelHeight);
  const title = offer ? `${tutorial.label ?? "おうちギルド"}の使い方` : step?.title;
  const text = offer
    ? (child ? "この{画面|がめん}の{使|つか}い{方|かた}を{覚|おぼ}えよう！ {明|あか}るい{枠|わく}のボタンを{押|お}して{進|すす}めるよ。" : tutorial.feature === "home" ? "ホームの見方を確認した後、子供の追加とログインの方法を案内します。実際に追加しなくても進められます。案内をはじめますか？" : "この機能の使い方を案内します。明るい枠のボタンや「次へ」で進めます。案内をはじめますか？")
    : step?.text;
  /** 案内が必要とする移動だけ、指定先を許可して行う。 */
  const navigate = (destination: string, action: () => void) => tutorial.navigate ? tutorial.navigate(destination, action) : action();
  const actions = [
    ...(offer ? [{ label: child ? "はじめる" : "案内をはじめる", onPress: () => tutorial.start() }] : []),
    ...(mode === "running" && target?.activate ? [{ label: child ? "このボタンを おす" : "対象のボタンを押す", onPress: target.activate }] : []),
    ...(mode === "running" && step?.explanation ? [{
      label: path === step.explanation.path ? (step.explanation.nextLabel ?? "次へ") : "説明の画面へ戻る",
      onPress: () => {
        const explanation = step.explanation;
        if (path !== explanation.path) {
          navigate(explanation.path, () => returnToTutorialScreen(explanation.path as Href));
          return;
        }
        if (explanation.returnTo) navigate(explanation.returnTo, () => returnToTutorialScreen(explanation.returnTo as Href));
        else if (explanation.nextRoute) navigate(explanation.nextRoute, () => router.push(explanation.nextRoute as Href));
        tutorial.advance(step.id);
      },
    }] : []),
    ...(done ? [{ label: child ? "おわる" : "案内を終える", onPress: tutorial.stop }] : []),
    ...(mode === "running" && !done ? [{ label: child ? "はじめから" : "はじめから案内", onPress: () => {
      tutorial.start();
      if (path !== homePath) navigate(homePath, () => returnToTutorialScreen(homePath as Href));
    } }] : []),
    ...(mode !== "idle" && !done ? [{ label: child ? "あとでみる" : "案内を閉じる", onPress: tutorial.stop }] : []),
    ...(storageError ? [{ label: child ? "ほぞんをやりなおす" : "表示履歴の保存を再試行", onPress: tutorial.retrySave }] : []),
  ];
  const content = <SafeAreaView
    testID={offer ? "tutorial-offer-card" : "tutorial-guide"}
    accessibilityViewIsModal
    edges={[]}
    onLayout={offer ? undefined : (event) => setPanelHeight(event.nativeEvent.layout.height)}
    className={child ? undefined : "rounded-2xl border-2 border-blue-600 bg-white"}
    style={[child && styles.panel, !offer && { position: "absolute", ...layout.panel }]}
  >
    <ScrollView style={{ flexGrow: 0, maxHeight: offer ? window.height * 0.7 : Math.max(0, layout.panel.maxHeight - 6) }}>
      <View className={child ? undefined : "gap-2 px-4 py-3"} style={child ? styles.content : undefined}>
        {title && (child ? <View accessibilityLiveRegion="polite"><Furigana accessibilityRole="header" style={styles.title}>
          {`${mode === "running" ? `${tutorial.index + 1}/${tutorial.total ?? 0}　` : ""}${title}`}
        </Furigana></View> : <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="text-base font-bold text-slate-900">
          {mode === "running" ? `${tutorial.index + 1}/${tutorial.total ?? 0}　` : ""}{title}
        </Text>)}
        {text && (child ? <Furigana style={styles.text}>{text}</Furigana> : <Text className="text-sm leading-5 text-slate-700">{text}</Text>)}
        {storageError && (child ? <Furigana style={styles.text}>{"{案内|あんない}の{表示|ひょうじ}{履歴|りれき}を{保存|ほぞん}できなかったよ。{次|つぎ}に{開|ひら}くとまた{表示|ひょうじ}されることがあるよ。"}</Furigana>
          : <Text className={`text-sm ${ERROR_TEXT_CLASS}`}>表示履歴を保存できませんでした。次回も案内が表示される場合があります。</Text>)}
        <View className={child ? undefined : "flex-row flex-wrap gap-2"} style={child ? styles.actions : undefined}>
          {actions.map((action) => <Pressable accessibilityRole="button" key={action.label} onPress={action.onPress}
            className={child ? undefined : "rounded-xl bg-blue-600 px-4 py-3"} style={child ? styles.button : undefined}>
            <Text className={child ? undefined : "text-sm font-semibold text-white"} style={child ? styles.buttonText : undefined}>{action.label}</Text>
          </Pressable>)}
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
  if (offer) return <TutorialOffer child={child} onClose={tutorial.stop}>{content}</TutorialOffer>;
  return <View ref={overlay} testID="tutorial-overlay" pointerEvents="box-none" style={styles.overlay}
    onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      overlay.current?.measureInWindow((x, y) => setBounds({ x, y, width, height }));
    }}>
    {mode === "running" && layout.shades.map((shade, index) => <View key={index} testID={`tutorial-shade-${index}`} accessible={false}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      style={{ position: "absolute", left: shade.x, top: shade.y, width: shade.width, height: shade.height, backgroundColor: child ? CHILD_THEME.tutorialBackdrop : UI_COLORS.tutorialBackdrop }} />)}
    {content}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 1000 },
  panel: { backgroundColor: CHILD_THEME.parchment, borderWidth: 3, borderColor: CHILD_THEME.gold, borderRadius: 20, overflow: "hidden" },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  title: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "bold" },
  text: { color: CHILD_THEME.darkWood, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: CHILD_THEME.darkWood, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "bold" },
});
