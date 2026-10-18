import { type ReactNode, useState } from "react";
import { Text } from "react-native";
import { TutorialContext } from "../../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS, type TutorialRole } from "../../lib/tutorial";

/** 説明文のカタログ上で、対象操作のときだけ次の手順へ進める（画面の部品の確認用）。 */
export function advanceCatalogStep(role: TutorialRole, index: number, targetId: string): number {
  return TUTORIAL_STEPS[role][index]?.id === targetId ? Math.min(index + 1, TUTORIAL_STEPS[role].length - 1) : index;
}

/** 実際の画面の操作で進むことを確認するため、途中の手順から始める。 */
export default function TutorialHarness({ initialStep, role = "parent", children }: {
  initialStep: string; role?: TutorialRole; children: ReactNode;
}) {
  const [index, setIndex] = useState(() => TUTORIAL_STEPS[role].findIndex((step) => step.id === initialStep));
  return <TutorialContext.Provider value={{
    role, mode: "running", index, step: TUTORIAL_STEPS[role][index], storageError: false,
    home: () => undefined, start: () => undefined, stop: () => undefined, retrySave: () => undefined,
    advance: (id) => setIndex((current) => advanceCatalogStep(role, current, id)),
  }}>
    <Text testID="tutorial-step">{TUTORIAL_STEPS[role][index].id}</Text>
    {children}
  </TutorialContext.Provider>;
}
