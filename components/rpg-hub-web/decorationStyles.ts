import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * かざるメニュー（木の道具箱）の色。
 *
 * ストア画面（`store/storeStyles.ts`）の木と羊皮紙に合わせている。
 * ストアと同じ値の色は、同じ見た目に見えるよう値もそろえた。
 */
const WOOD = {
  /** 箱の板。ストアの棚板と同じ */
  board: "#5b321f",
  /** 板の明るいふち。ストアの棚板のふちと同じ */
  edge: "#9b6338",
  /** 押したときの暗い板 */
  pressed: "#2a160d",
  /** 絵の下地。羊皮紙より少し濃い */
  slot: "#f5e7c2",
  /** 説明文。板の上で読める明るさ */
  hint: "#ead9b0",
  /** 置けないときの文字。羊皮紙の上で読める濃さの赤 */
  error: "#9a1c1c",
} as const;

/** 装飾の絵の色。3Dの装飾の色に寄せている。 */
export const DECORATION_ICON_COLORS = {
  bark: "#7a4a26",
  berry: "#d94b4b",
  flowerPink: "#f472b6",
  flowerPurple: "#a78bfa",
  flowerRed: "#f87171",
  flowerYellow: "#facc15",
  leaf: "#2f7d3b",
  leafDark: "#286b33",
  leafLight: "#43a050",
  metal: "#3f3f46",
  lampGlow: "#fde68a",
  lampLight: "#facc15",
  rock: "#9ca3af",
  rockLight: "#c3c8cf",
  soil: "#8a5a33",
  cloth: "#60a5fa",
} as const;

export const decorationStyles = StyleSheet.create({
  box: {
    backgroundColor: WOOD.board,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 16,
    borderTopColor: WOOD.edge,
    borderWidth: 3,
    bottom: 12,
    left: 8,
    paddingBottom: 12,
    paddingHorizontal: 10,
    paddingTop: 22,
    position: "absolute",
    right: 8,
    shadowColor: CHILD_THEME.shadow,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },
  sign: {
    alignSelf: "center",
    backgroundColor: CHILD_THEME.parchment,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 9,
    borderWidth: 3,
    paddingHorizontal: 18,
    paddingVertical: 2,
    position: "absolute",
    top: -16,
  },
  signText: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  count: {
    color: CHILD_THEME.paleYellow,
    fontSize: 12,
    fontWeight: "800",
    position: "absolute",
    right: 12,
    top: 4,
  },
  message: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: WOOD.error,
    borderRadius: 8,
    borderWidth: 2,
    color: WOOD.error,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shelf: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 2,
  },
  shelfContent: { gap: 6, padding: 7 },
  slot: { alignItems: "center", width: 74 },
  slotPicture: {
    alignItems: "center",
    backgroundColor: WOOD.slot,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  slotPictureSelected: {
    backgroundColor: CHILD_THEME.paleYellow,
    borderColor: CHILD_THEME.brightYellow,
    borderWidth: 3,
    shadowColor: CHILD_THEME.brightYellow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  slotLabel: {
    color: CHILD_THEME.darkWood,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 3,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  placeButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderBottomWidth: 5,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 12,
    borderWidth: 2,
    flex: 1,
    paddingVertical: 10,
  },
  placeButtonPressed: { backgroundColor: CHILD_THEME.gold, borderBottomWidth: 2, marginTop: 3 },
  placeButtonDisabled: { backgroundColor: CHILD_THEME.fadedBeige },
  placeButtonText: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  subButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.darkWood,
    borderBottomWidth: 5,
    borderColor: WOOD.pressed,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  removeButton: { backgroundColor: WOOD.edge },
  subButtonPressed: { borderBottomWidth: 2, marginTop: 3 },
  subButtonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "900" },
  hint: { color: WOOD.hint, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "center" },
});
