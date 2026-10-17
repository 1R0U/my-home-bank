import { StyleSheet } from "react-native";
import { RPG_HUB_SKY_COLOR } from "../constants/ui";
import { CHILD_THEME } from "./childTheme";

/**
 * 読み込み中の画面（Issue #261）の色。
 *
 * 我が家タウンに入るとき・タウンから建物へ入るときに出す画面なので、
 * 背景は町の空と同じ色にして、町から地続きに見えるようにしてある。
 */
export const TRAVEL_LOADING_COLORS = {
  /** 背景。町の空の色 */
  background: RPG_HUB_SKY_COLOR,
  /** キャラクターの足元の影 */
  shadow: "rgba(64, 36, 22, 0.18)",
  /** 文字。木の板に置く文字と同じ濃い茶 */
  text: CHILD_THEME.darkWood,
  /** コマ絵ができるまでの代わりの人型アイコン */
  fallbackIcon: CHILD_THEME.darkWood,
} as const;

/** キャラクターを出す大きさ（一辺）。 */
export const TRAVEL_CHARACTER_SIZE = 168;

export const travelLoadingStyles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: TRAVEL_LOADING_COLORS.background,
    flex: 1,
    justifyContent: "center",
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  fill: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  stage: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  shadow: {
    backgroundColor: TRAVEL_LOADING_COLORS.shadow,
    borderRadius: 999,
    bottom: 14,
    height: 16,
    position: "absolute",
    width: TRAVEL_CHARACTER_SIZE * 0.45,
  },
  character: {
    height: TRAVEL_CHARACTER_SIZE,
    width: TRAVEL_CHARACTER_SIZE,
  },
  frame: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  fallback: {
    alignItems: "center",
    height: TRAVEL_CHARACTER_SIZE,
    justifyContent: "center",
    width: TRAVEL_CHARACTER_SIZE,
  },
  labelRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    marginTop: 12,
  },
  label: {
    color: TRAVEL_LOADING_COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 2,
  },
  dot: {
    color: TRAVEL_LOADING_COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    width: 12,
  },
});
