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
  bear: "#b07a4a",
  bearLight: "#e8c9a0",
  pot: "#d97b4a",
  rugRed: "#c95a5a",
  shade: "#fbe3a8",
  sheet: "#f7f3ea",
  toyBox: "#e98a6b",
  rugYellow: "#f0b45b",
  wood: "#b7804b",
  woodDark: "#7a4e2c",
} as const;

/** パネルと画面の下端とのすき間。 */
export const PANEL_BOTTOM_GAP = 12;

export const decorationStyles = StyleSheet.create({
  /** パネルと、そのすぐ上の1行（理由・「もとに もどす」）をまとめて画面の下に置く */
  dock: { bottom: PANEL_BOTTOM_GAP, left: 8, position: "absolute", right: 8 },
  /** パネルのすぐ上の1行。高さを決めておく（Issue #477） */
  floatRow: { alignItems: "center", flexDirection: "row", gap: 8, height: 40, marginBottom: 20 },
  messageSlot: { alignItems: "flex-start", flex: 1 },
  box: {
    backgroundColor: WOOD.board,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 16,
    borderTopColor: WOOD.edge,
    borderWidth: 3,
    paddingBottom: 12,
    paddingHorizontal: 10,
    paddingTop: 22,
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
  /** 「もとに もどす」。パネルのすぐ上の行の右に置く */
  resetViewButton: {
    backgroundColor: CHILD_THEME.parchment,
    borderBottomWidth: 4,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetViewButtonPressed: { borderBottomWidth: 2, marginTop: 2 },
  resetViewText: { color: CHILD_THEME.darkWood, fontSize: 12, fontWeight: "900" },
  message: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: WOOD.error,
    borderRadius: 8,
    borderWidth: 2,
    color: WOOD.error,
    fontSize: 13,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  /**
   * 一覧と「まわす」などのボタンを切り替えて出す欄。高さを決めておく
   * （切り替えるたびにパネルの高さが変わると、部屋を収め直すためにカメラが動く。Issue #477）
   */
  content: { height: 100, justifyContent: "center" },
  /** 家の中で出す「かぐ」「かべ」「ゆか」のタブ（Issue #480） */
  tabs: { flexDirection: "row", gap: 6, marginBottom: 6 },
  tab: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.darkWood,
    borderColor: WOOD.pressed,
    borderRadius: 10,
    borderWidth: 2,
    flex: 1,
    height: 30,
    justifyContent: "center",
  },
  tabSelected: { backgroundColor: CHILD_THEME.parchment, borderColor: CHILD_THEME.gold },
  tabText: { color: CHILD_THEME.parchment, fontSize: 13, fontWeight: "900" },
  tabTextSelected: { color: CHILD_THEME.darkWood },
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
  /** 引っぱっている装飾の絵（DecorationDragGhost）。持ち上げたように見せる */
  ghostPicture: {
    borderColor: CHILD_THEME.brightYellow,
    borderWidth: 3,
    opacity: 0.92,
    shadowColor: CHILD_THEME.shadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  /** 置き切った・上限に達したなど、いまは置けない装飾 */
  slotDimmed: { opacity: 0.45 },
  backPicture: { backgroundColor: WOOD.board, borderColor: CHILD_THEME.darkWood },
  backArrow: { color: CHILD_THEME.parchment, fontSize: 30, fontWeight: "900", lineHeight: 34 },
  countBadge: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.darkWood,
    borderColor: CHILD_THEME.parchment,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -7,
    top: -7,
  },
  countBadgeText: { color: CHILD_THEME.parchment, fontSize: 11, fontWeight: "900" },
  slotLabel: {
    color: CHILD_THEME.darkWood,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 3,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 8 },
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
  /** 「しまう」「やめる」。「まわす」と同じ幅に並べる */
  actionButton: { flex: 1, paddingVertical: 10 },
  exitButton: { paddingVertical: 8 },
  subButtonPressed: { borderBottomWidth: 2, marginTop: 3 },
  subButtonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "900" },
  // 案内の文言が1行でも2行でも高さを変えない（パネルの高さが変わるとカメラが動くため）
  footer: { alignItems: "center", flexDirection: "row", gap: 8, height: 34, marginTop: 8 },
  footerHint: { color: WOOD.hint, flex: 1, fontSize: 11, fontWeight: "700" },
});
