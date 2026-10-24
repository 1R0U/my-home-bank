import { type ComponentRef, useCallback, useEffect, useRef } from "react";
import { Pressable, type PressableProps, StyleSheet, View } from "react-native";
import { UI_COLORS } from "../../constants/ui";
import type { TutorialFeature } from "../../lib/tutorialFeatures";
import { CHILD_THEME } from "../childTheme";
import { useTutorial } from "./TutorialContext";

/** 位置が動いている間の計測間隔。 */
const TUTORIAL_MOVING_INTERVAL = 200;
/** 位置が落ち着いた後の計測間隔。案内中に指で動かされたスクロールにも追いつく。 */
const TUTORIAL_IDLE_INTERVAL = 1000;
/** 同じ位置がこの回数続いたら、落ち着いたとみなす。 */
const TUTORIAL_STABLE_COUNT = 5;

/** 枠はタッチを奪わない。中身も onPress も通常のボタンをそのまま使う。 */
export function TutorialFrame({ id, onActivate }: { id?: string; onActivate?: (event: any) => void }) {
  const tutorial = useTutorial();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;
  /** 説明パネルから、再計測を起こさず最新のボタン操作を呼び出す。 */
  const activate = useCallback((event: any) => activateRef.current?.(event), []);
  const active = Boolean(id && tutorial?.step?.id === id);
  const register = tutorial?.registerTarget;
  const clear = tutorial?.clearTarget;
  /** 対象の位置を測って登録する。onMeasured には、位置が動いているかの判定用に測った値を渡す。 */
  const measure = useCallback((onMeasured?: (position: string) => void) => {
    if (!active || !register) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      register({ id, rect: width > 0 && height > 0 ? { x, y, width, height } : null, activate: activateRef.current ? activate : undefined });
      onMeasured?.(`${x},${y},${width},${height}`);
    });
  }, [active, id, register, activate]);
  useEffect(() => {
    if (!active) return;
    // 自動スクロールや画面回転の間は細かく測り、位置が落ち着いたら間隔を空けて追いかける。
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    let stableCount = 0;
    /** 対象を再計測し、位置の安定度に応じた間隔で次の計測を予約する。 */
    const tick = () => {
      measure((position) => {
        stableCount = position === previous ? stableCount + 1 : 0;
        previous = position;
      });
      timer = setTimeout(tick, stableCount >= TUTORIAL_STABLE_COUNT ? TUTORIAL_IDLE_INTERVAL : TUTORIAL_MOVING_INTERVAL);
    };
    tick();
    return () => { clearTimeout(timer); clear?.(id); };
  }, [active, id, measure, clear]);
  if (!active) return null;
  return <View ref={ref} collapsable={false} onLayout={() => measure()} pointerEvents="none" testID={`tutorial-frame-${id}`} style={[
    StyleSheet.absoluteFill,
    { borderRadius: 16, borderWidth: 3, borderColor: tutorial.role === "child" ? CHILD_THEME.tutorialRed : UI_COLORS.blue600 },
    // 枠の内側とボタンの間に6pxの隙間を空ける。ボタンの大きさ・押せる範囲は変えない。
    { top: -9, bottom: -9, left: -9, right: -9 },
  ]} />;
}

/** 通常のボタンに案内対象の枠を添え、対象外の操作を制限する。 */
export default function TutorialPressable({ tutorialId, children, onPress, ...props }: PressableProps & { tutorialId?: string }) {
  const tutorial = useTutorial();
  /** 有効な対象を操作し、操作側が明示的に中断しなければ案内を進める。 */
  const activate = (event: any) => {
    if (props.disabled || tutorial?.canInteract?.(tutorialId) === false) return;
    const result: unknown = onPress?.(event);
    if (tutorialId && result !== false) tutorial?.advance(tutorialId);
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
