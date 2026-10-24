import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用の履歴画面（`ChildHistoryScreen`）のスタイル（Issue #438）。
 * タスク・ストアと同じ、木と羊皮紙の世界観に合わせる。
 */

/** 羊皮紙の面の色 */
const PARCHMENT_PANEL = "#f6e7c1";
/** 羊皮紙の面のふち */
const PARCHMENT_BORDER = "#c9a46a";
/** 羊皮紙の上に置く、控えめな文字（日付など） */
const FADED_INK = "#6b5134";

/** 金額の色（羊皮紙の上で読める濃さにしている） */
export const CHILD_AMOUNT_COLORS = {
  expense: "#a8321f",
  income: "#2e6b2a",
  neutral: FADED_INK,
} as const;

export const childHistoryStyles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#7a4b28",
    flex: 1,
  },
  header: {
    backgroundColor: "#7a4b28",
    paddingBottom: 13,
    paddingHorizontal: 17,
    paddingTop: 7,
  },
  eyebrow: { color: "#e0b86a", fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  screenTitle: { color: CHILD_THEME.parchment, fontSize: 26, fontWeight: "900", marginTop: 1 },
  boardFrame: {
    backgroundColor: "#57432f",
    borderColor: "#9d7950",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 4,
    flex: 1,
    marginHorizontal: 9,
    overflow: "hidden",
  },
  scrollContent: { gap: 14, padding: 12, paddingBottom: 24 },
  panel: {
    backgroundColor: PARCHMENT_PANEL,
    borderColor: PARCHMENT_BORDER,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  panelHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  panelTitle: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "900" },
  granularityButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  granularityText: { color: CHILD_THEME.darkWood, fontSize: 13, fontWeight: "900" },
  chartArea: { marginTop: 8 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  rowDivider: { borderBottomColor: PARCHMENT_BORDER, borderBottomWidth: 1 },
  rowText: { flex: 1, paddingRight: 12 },
  description: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "800" },
  date: { color: FADED_INK, fontSize: 12, fontWeight: "700", marginTop: 2 },
  amount: { fontSize: 17, fontWeight: "900" },
  messageText: { color: CHILD_THEME.darkWood, fontSize: 14, fontWeight: "800", paddingVertical: 16, textAlign: "center" },
  loginText: { color: CHILD_THEME.parchment, fontSize: 15, fontWeight: "800" },
  retryButton: {
    alignSelf: "center",
    backgroundColor: CHILD_THEME.gold,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 6,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  retryButtonText: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "900" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center", paddingVertical: 40 },
  footer: {
    backgroundColor: "#7a4b28",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 11,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
