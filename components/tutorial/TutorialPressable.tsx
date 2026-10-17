import { useEffect } from "react";
import { Pressable, type PressableProps, StyleSheet, View } from "react-native";
import { UI_COLORS } from "../../constants/ui";
import type { TutorialFeature } from "../../lib/tutorialFeatures";
import { CHILD_THEME } from "../childTheme";
import { useTutorial } from "./TutorialContext";

/** 枠はタッチを奪わない。中身も onPress も通常のボタンをそのまま使う。 */
export function TutorialFrame({ id }: { id?: string }) {
  const tutorial = useTutorial();
  if (!id || tutorial?.step?.id !== id) return null;
  return <View pointerEvents="none" testID={`tutorial-frame-${id}`} style={[
    StyleSheet.absoluteFill,
    { borderRadius: 16, borderWidth: 3, borderColor: tutorial.role === "child" ? CHILD_THEME.tutorialRed : UI_COLORS.blue600 },
    // 枠の内側とボタンの間に6pxの隙間を空ける。ボタンの大きさ・押せる範囲は変えない。
    { top: -9, bottom: -9, left: -9, right: -9 },
  ]} />;
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
export function TutorialHome({ ready = true, feature }: { ready?: boolean; feature?: TutorialFeature }) {
  const tutorial = useTutorial();
  const home = tutorial?.home;
  useEffect(() => {
    home?.(feature, ready);
    return () => home?.(feature, false);
  }, [ready, feature, home]);
  return null;
}
