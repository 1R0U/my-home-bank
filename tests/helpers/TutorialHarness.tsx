import { type ReactNode, useState } from "react";
import { Text } from "react-native";
import { TutorialContext } from "../../components/tutorial/TutorialContext";
import { advanceTutorial, TUTORIAL_STEPS, type TutorialRole } from "../../lib/tutorial";

/** 実際の画面の操作で進むことを確認するため、途中の手順から始める。 */
export default function TutorialHarness({ initialStep, role = "parent", children }: {
  initialStep: string; role?: TutorialRole; children: ReactNode;
}) {
  const [index, setIndex] = useState(() => TUTORIAL_STEPS[role].findIndex((step) => step.id === initialStep));
  return <TutorialContext.Provider value={{
    role, mode: "running", index, step: TUTORIAL_STEPS[role][index], storageError: false,
    home: () => undefined, start: () => undefined, stop: () => undefined, retrySave: () => undefined,
    advance: (id) => setIndex((current) => advanceTutorial(role, current, id)),
  }}>
    <Text testID="tutorial-step">{TUTORIAL_STEPS[role][index].id}</Text>
    {children}
  </TutorialContext.Provider>;
}
