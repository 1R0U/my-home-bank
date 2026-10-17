import { useCallback, useEffect, useRef } from "react";
import { Pressable, type PressableProps, StyleSheet, View } from "react-native";
import { UI_COLORS } from "../../constants/ui";
import type { TutorialFeature } from "../../lib/tutorialFeatures";
import { CHILD_THEME } from "../childTheme";
import { useTutorial } from "./TutorialContext";

/** 枠はタッチを奪わない。中身も onPress も通常のボタンをそのまま使う。 */
export function TutorialFrame({ id, onActivate }: { id?: string; onActivate?: (event: any) => void }) {
  const tutorial = useTutorial();
  const ref = useRef<View>(null);
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;
  const activate = useCallback((event: any) => activateRef.current?.(event), []);
  const active = Boolean(id && tutorial?.step?.id === id);
  const register = tutorial?.registerTarget;
  const clear = tutorial?.clearTarget;
  const measure = useCallback(() => {
    if (!active || !register) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      register({ id, rect: width > 0 && height > 0 ? { x, y, width, height } : null, activate: activateRef.current ? activate : undefined });
    });
  }, [active, id, register, activate]);
  useEffect(() => {
    if (!active) return;
    // スクロールや画面回転でも、枠と説明が実際のボタンを追いかける。
    measure();
    const timer = setInterval(measure, 200);
    return () => { clearInterval(timer); clear?.(id); };
  }, [active, id, measure, clear]);
  if (!active) return null;
  return <View ref={ref} collapsable={false} onLayout={measure} pointerEvents="none" testID={`tutorial-frame-${id}`} style={[
    StyleSheet.absoluteFill,
    { borderRadius: 16, borderWidth: 3, borderColor: tutorial.role === "child" ? CHILD_THEME.tutorialRed : UI_COLORS.blue600 },
    // 枠の内側とボタンの間に6pxの隙間を空ける。ボタンの大きさ・押せる範囲は変えない。
    { top: -9, bottom: -9, left: -9, right: -9 },
  ]} />;
}

export default function TutorialPressable({ tutorialId, children, onPress, ...props }: PressableProps & { tutorialId?: string }) {
  const tutorial = useTutorial();
  const activate = (event: any) => {
    if (props.disabled || tutorial?.canInteract?.(tutorialId) === false) return;
    const perform = () => {
      const result: unknown = onPress?.(event);
      if (tutorialId && result !== false) tutorial?.advance(tutorialId);
    };
    if (tutorial?.step?.navigationPath && tutorial.navigate) tutorial.navigate(tutorial.step.navigationPath, perform);
    else perform();
  };
  return (
    <Pressable {...props} onPress={activate}>
      {(state) => <>{typeof children === "function" ? children(state) : children}<TutorialFrame id={tutorialId} onActivate={props.disabled ? undefined : activate} /></>}
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
