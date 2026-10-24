import { type Href, router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { playSoundEffect } from "../lib/audio";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import TutorialPressable from "./tutorial/TutorialPressable";

/**
 * 前の画面へ戻る。戻れる画面がないとき（Webでの再読み込み・ディープリンク）は `fallbackHref` へ移る。
 * `fallbackHref` を省くと、これまでどおり `router.back()` だけを呼ぶ。
 */
export function goBackOrReplace(fallbackHref?: Href) {
  if (fallbackHref && !router.canGoBack()) router.replace(fallbackHref);
  else router.back();
}

type ChildBackButtonProps = {
  /** 戻れる画面がないときの移り先 */
  fallbackHref?: Href;
  /** 送信中など、画面を離れてほしくない間は true にする */
  disabled?: boolean;
  tutorialId?: string;
};

/**
 * 子供用画面の下に置く「‹ 戻る」ボタン（ストア画面の見た目）。
 * 見た目は内側の View に付ける。Pressable の style を関数で渡すと、実機で背景・枠が付かなかった（Issue #487）。
 */
export default function ChildBackButton({ fallbackHref, disabled = false, tutorialId }: ChildBackButtonProps) {
  return (
    <TutorialPressable
      accessibilityLabel="前の画面に戻る"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        playSoundEffect("cancel");
        goBackOrReplace(fallbackHref);
      }}
      tutorialId={tutorialId}
    >
      {({ pressed }) => (
        <View style={[styles.button, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}>
          <Text style={styles.arrow}>‹</Text>
          <Furigana noWrap style={styles.text}>{"{戻|もど}る"}</Furigana>
        </View>
      )}
    </TutorialPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    minWidth: 122,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  arrow: {
    color: CHILD_THEME.parchment,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 22,
    marginRight: 8,
  },
  text: { color: CHILD_THEME.parchment, fontSize: 18, fontWeight: "800" },
});
