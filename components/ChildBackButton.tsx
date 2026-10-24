import { type Href, router } from "expo-router";
import { type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { playSoundEffect } from "../lib/audio";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import TutorialPressable from "./tutorial/TutorialPressable";

/**
 * 前の画面へ戻る。戻れる画面がないとき（Webでの再読み込み・ディープリンク）は `fallbackHref` へ移る。
 * `router.back()` だけだと、戻れる画面がないときに押しても何も起きない。
 */
export function goBackOrReplace(fallbackHref: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallbackHref);
}

/** 掲示板のように、木の枠とは違う見た目の画面で使うときに丸ごと差し替える見た目 */
export type ChildBackButtonAppearance = {
  button: StyleProp<ViewStyle>;
  arrow: StyleProp<TextStyle>;
  text: StyleProp<TextStyle>;
  pressed: StyleProp<ViewStyle>;
};

type ChildBackButtonProps = {
  /** 戻れる画面がないときの移り先。省くとホーム（`/`）へ移る */
  fallbackHref?: Href;
  /** 送信中など、画面を離れてほしくない間は true にする */
  disabled?: boolean;
  tutorialId?: string;
  /** 押せる範囲（Pressable）の置き方。フッターが横並びでない画面で `alignSelf` を渡す */
  style?: StyleProp<ViewStyle>;
  /** 省くと、ストア・タスク・銀行などと同じ木の枠の見た目になる */
  appearance?: ChildBackButtonAppearance;
};

/**
 * 子供用画面の下に置く「‹ 戻る」ボタン。
 * 見た目は内側の View に付ける。Pressable の style を関数で渡すと、実機で背景・枠が付かなかった（Issue #487）。
 */
export default function ChildBackButton({
  fallbackHref = "/",
  disabled = false,
  tutorialId,
  style,
  appearance = defaultAppearance,
}: ChildBackButtonProps) {
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
      style={style}
      tutorialId={tutorialId}
    >
      {({ pressed }) => (
        <View style={[appearance.button, disabled && styles.buttonDisabled, pressed && appearance.pressed]}>
          <Text style={appearance.arrow}>‹</Text>
          <Furigana noWrap style={appearance.text}>{"{戻|もど}る"}</Furigana>
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

const defaultAppearance: ChildBackButtonAppearance = {
  button: styles.button,
  arrow: styles.arrow,
  text: styles.text,
  pressed: styles.buttonPressed,
};
