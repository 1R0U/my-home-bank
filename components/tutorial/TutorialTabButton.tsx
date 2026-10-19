import { PlatformPressable } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { TutorialFrame } from "./TutorialPressable";
import { useTutorial } from "./TutorialContext";

/** タブに案内対象の枠を付け、案内中はタブ切替による離脱を止める。 */
export default function TutorialTabButton({ tutorialId, children, onPress, ...props }: ComponentProps<typeof PlatformPressable> & { tutorialId: string }) {
  const tutorial = useTutorial();
  return <PlatformPressable {...props} onPress={(event) => {
    if (tutorial?.mode === "running") return;
    onPress?.(event);
    tutorial?.advance(tutorialId);
  }}>{children}<TutorialFrame id={tutorialId} /></PlatformPressable>;
}
