import { useTutorial } from "./TutorialContext";
import { usePreventRemove } from "expo-router/react-navigation";
import { PreventRemovalProvider } from "expo-router/build/global-state/removalPrevention";
import type { ReactNode } from "react";

/** ネイティブの戻る操作・スワイプを、各画面のナビゲーションで止める。 */
export function TutorialScreenLock({ children }: { children: ReactNode }) {
  const tutorial = useTutorial();
  // SDK 58では、止めたままの dispatch はもう一度止められる。許可した移動は repeat で
  // 止めるのを外してから流す（Issue #485）
  usePreventRemove(Boolean(tutorial?.canNavigateAction && tutorial.mode === "running"), ({ data, repeat }) => {
    if (tutorial?.canNavigateAction?.(data.action)) repeat();
  });
  return children;
}

/**
 * ナビゲーターの各画面を、戻る操作を制御する共通レイアウトで包む。
 *
 * SDK 58では `screenLayout` が画面ごとの離脱防止の範囲より外で描画されるため、そのままでは
 * usePreventRemove が親のルートを止めてしまい、この画面の離脱は止まらない。この画面の
 * ルートに結びつけた範囲を張ってから使う（Issue #485）。
 */
export const tutorialScreenLayout = ({ children, route }: { children: ReactNode; route: { key: string } }) => (
  <PreventRemovalProvider routeKey={route.key}>
    <TutorialScreenLock>{children}</TutorialScreenLock>
  </PreventRemovalProvider>
);

/** 戻る・置き換えによる離脱を止める。対象ボタンから許可した移動だけは通す。 */
export function useTutorialNavigationLock() {
  const tutorial = useTutorial();
  return {
    gestureEnabled: tutorial?.mode !== "running",
  };
}
