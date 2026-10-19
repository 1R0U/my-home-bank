import { useTutorial } from "./TutorialContext";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import type { ReactNode } from "react";

/** ネイティブの戻る操作・スワイプを、各画面のナビゲーションで止める。 */
export function TutorialScreenLock({ children }: { children: ReactNode }) {
  const tutorial = useTutorial();
  const navigation = useNavigation();
  usePreventRemove(Boolean(tutorial?.canNavigateAction && tutorial.mode === "running"), ({ data }) => {
    if (tutorial?.canNavigateAction?.(data.action)) navigation.dispatch(data.action);
  });
  return children;
}

/** ナビゲーターの各画面を、戻る操作を制御する共通レイアウトで包む。 */
export const tutorialScreenLayout = ({ children }: { children: ReactNode }) => <TutorialScreenLock>{children}</TutorialScreenLock>;

/** 戻る・置き換えによる離脱を止める。対象ボタンから許可した移動だけは通す。 */
export function useTutorialNavigationLock() {
  const tutorial = useTutorial();
  return {
    gestureEnabled: tutorial?.mode !== "running",
  };
}
