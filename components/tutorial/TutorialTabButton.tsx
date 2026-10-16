import { PlatformPressable } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { TutorialFrame } from "./TutorialPressable";
import { useTutorial } from "./TutorialContext";

export default function TutorialTabButton({ tutorialId, children, onPress, ...props }: ComponentProps<typeof PlatformPressable> & { tutorialId: string }) {
  const tutorial = useTutorial();
  return <PlatformPressable {...props} onPress={(event) => {
    onPress?.(event);
    tutorial?.advance(tutorialId);
  }}>{children}<TutorialFrame id={tutorialId} /></PlatformPressable>;
}
