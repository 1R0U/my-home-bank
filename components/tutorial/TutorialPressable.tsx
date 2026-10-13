import { useEffect } from "react";
import { Pressable, type PressableProps, StyleSheet, View } from "react-native";
import { UI_COLORS } from "../../constants/ui";
import { CHILD_THEME } from "../childTheme";
import { useTutorial } from "./TutorialContext";

/** 枠はタッチを奪わない。中身も onPress も通常のボタンをそのまま使う。 */
export function TutorialFrame({ id }: { id?: string }) {
  const tutorial = useTutorial();
  if (!id || tutorial?.step?.id !== id) return null;
  return <View pointerEvents="none" testID={`tutorial-frame-${id}`} style={[
    StyleSheet.absoluteFill,
    { borderRadius: 12, borderWidth: 3, borderColor: tutorial.role === "child" ? CHILD_THEME.darkWood : UI_COLORS.blue600 },
  ]} >
    {tutorial.role === "child" && <View style={[StyleSheet.absoluteFill, { borderRadius: 8, borderWidth: 2, borderColor: CHILD_THEME.brightYellow }]} />}
  </View>;
}

export default function TutorialPressable({ tutorialId, children, onPress, ...props }: PressableProps & { tutorialId?: string }) {
  const tutorial = useTutorial();
  return (
    <Pressable {...props} onPress={(event) => {
      const result: unknown = onPress?.(event);
      if (tutorialId && result !== false) tutorial?.advance(tutorialId);
    }}>
      {(state) => <>{typeof children === "function" ? children(state) : children}<TutorialFrame id={tutorialId} /></>}
    </Pressable>
  );
}

/** ホームが準備できてから初回の案内を提示する。町の読み込み中には出さない。 */
export function TutorialHome({ ready = true }: { ready?: boolean }) {
  const tutorial = useTutorial();
  const home = tutorial?.home;
  useEffect(() => { if (ready) home?.(); }, [ready, home]);
  return null;
}
