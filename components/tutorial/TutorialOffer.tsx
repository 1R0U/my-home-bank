import type { ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CHILD_THEME } from "../childTheme";

/** 開始するかを選ぶ間だけ中央に表示する。開始後は通常の下部パネルへ戻す。 */
export default function TutorialOffer({ child, onClose, children }: {
  child: boolean; onClose: () => void; children: ReactNode;
}) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} testID="tutorial-offer">
    <SafeAreaView
      style={child ? styles.center : undefined}
      className={child ? undefined : "flex-1 items-center justify-center p-6"}
    >
      <View pointerEvents="none" style={child ? styles.backdrop : undefined}
        className={child ? undefined : "absolute inset-0 bg-black/50"} />
      <View accessibilityViewIsModal style={child ? styles.card : undefined}
        className={child ? undefined : "w-full max-w-lg"}>
        {children}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: CHILD_THEME.shadow, opacity: 0.5 },
  card: { width: "100%", maxWidth: 512 },
});
