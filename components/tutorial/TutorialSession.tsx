import type { ReactNode } from "react";
import { View } from "react-native";
import { useCurrentUser } from "../../store";
import { useTutorial } from "./TutorialContext";
import TutorialGuide from "./TutorialGuide";
import TutorialProvider from "./TutorialProvider";

/**
 * 案内中は、画面読み上げでも背景の画面へフォーカスが移らないようにする。暗幕はタッチしか止めないため。
 * 対象のボタンは、説明パネルの「対象のボタンを押す」から同じ操作ができる。
 */
function TutorialScreenContent({ children }: { children: ReactNode }) {
  const running = useTutorial()?.mode === "running";
  return <View
    accessibilityElementsHidden={running}
    importantForAccessibility={running ? "no-hide-descendants" : "auto"}
    style={{ flex: 1 }}
  >{children}</View>;
}

export default function TutorialSession({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  return <TutorialProvider userId={user?.id ?? null} role={user?.role ?? "parent"}>
    <TutorialScreenContent>{children}</TutorialScreenContent>
    <TutorialGuide />
  </TutorialProvider>;
}
