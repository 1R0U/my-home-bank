import type { ReactNode } from "react";
import { View } from "react-native";
import { useCurrentUser } from "../../store";
import TutorialGuide from "./TutorialGuide";
import TutorialProvider from "./TutorialProvider";

export default function TutorialSession({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  return <TutorialProvider userId={user?.id ?? null} role={user?.role ?? "parent"}>
    <View style={{ flex: 1 }}>{children}</View>
    <TutorialGuide />
  </TutorialProvider>;
}
