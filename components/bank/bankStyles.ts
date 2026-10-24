import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用の銀行画面（`ChildBankScreen`）のスタイル（Issue #437）。
 *
 * タスク・ストアと同じ木と羊皮紙の世界観にそろえる。両方に出る色は `CHILD_THEME`、
 * この画面にしか出ない色はここに置く（`childTheme.ts` の方針）。
 */
export const bankStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#171220" },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 12 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  eyebrow: { color: CHILD_THEME.gold, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  screenTitle: { color: CHILD_THEME.parchment, fontSize: 25, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  /** 木の枠。ストアの棚の枠と同じ色 */
  frame: {
    backgroundColor: "#5b321f",
    borderColor: "#9b6338",
    borderRadius: 20,
    borderWidth: 5,
    marginBottom: 14,
    padding: 12,
  },
  sign: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#d9b978",
    borderColor: "#6d3f24",
    borderRadius: 8,
    borderWidth: 3,
    marginBottom: 12,
    paddingHorizontal: 28,
    paddingVertical: 6,
    transform: [{ rotate: "-1deg" }],
  },
  signText: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  /** 羊皮紙の札。残高を書く */
  balanceCard: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceLabel: { color: "#69462d", fontSize: 12, fontWeight: "700" },
  balanceRow: { alignItems: "center", flexDirection: "row", marginTop: 4 },
  coin: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    marginRight: 8,
    width: 24,
  },
  coinText: { color: "#68440d", fontSize: 13, fontWeight: "900" },
  balanceValue: { color: CHILD_THEME.darkWood, fontSize: 30, fontWeight: "900" },
  errorText: { color: "#ffb4a8", fontSize: 13, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  /** 確認待ち・破損記録のお知らせ */
  notice: {
    backgroundColor: "#3a2b46",
    borderColor: CHILD_THEME.gold,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
    padding: 12,
  },
  noticeText: { color: CHILD_THEME.parchment, fontSize: 13, fontWeight: "700" },
  noticeLink: { paddingVertical: 8 },
  noticeLinkText: { color: CHILD_THEME.brightYellow, fontSize: 14, fontWeight: "900" },
  actionRow: { flexDirection: "row", gap: 12 },
  actionButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 12,
    borderWidth: 2,
    flex: 1,
    paddingVertical: 14,
  },
  actionButtonSecondary: { backgroundColor: "#e8d3a2", borderColor: CHILD_THEME.fadedBeige },
  actionButtonDisabled: { backgroundColor: "#6b5d55", borderColor: "#857369" },
  actionButtonText: { color: CHILD_THEME.darkWood, fontSize: 17, fontWeight: "900" },
  actionButtonTextDisabled: { color: "#c9bdb4" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  savingsButton: {
    alignItems: "center",
    backgroundColor: "#2a2135",
    borderColor: CHILD_THEME.gold,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 14,
    paddingVertical: 14,
  },
  savingsButtonText: { color: CHILD_THEME.gold, fontSize: 16, fontWeight: "900" },
  footer: { backgroundColor: "#171220", paddingHorizontal: 16, paddingTop: 12 },
  // フッターが横並びでないので、戻るボタン（ChildBackButton）を左に寄せる
  backButtonLayout: { alignSelf: "flex-start" },
  loginRequired: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
});
