import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用の掲示板（`ChildNotificationsScreen`）の配色（Issue #441）。
 *
 * 町の広場に立つ、木の枠にコルクを張った掲示板に、羊皮紙のお知らせを画びょうで留めた見た目。
 * アイコンの `color` など、className も style も受け取れない場所に渡す色もここに置く。
 */
export const NOTICE_BOARD_COLORS = {
  /** 広場の石だたみ（画面の背景） */
  plaza: "#2f3b33",
  /** 枠の木 */
  frameWood: "#7a4a26",
  /** 枠のふち（明るい木目） */
  frameEdge: "#a8703f",
  /** 屋根の板 */
  roofWood: "#5a321b",
  /** コルク */
  cork: "#c4935a",
  /** コルクの粒（少し濃い） */
  corkSpeck: "#94612c",
  /** コルクの粒（少し明るい） */
  corkLight: "#e0b884",
  /** 新しい羊皮紙 */
  paper: "#fdf3d6",
  /**
   * 読んだあとの、日に焼けた紙。新しい紙より暗くし、コルクの上でも紙だと分かる濃さにする（Issue #486）。
   * 半透明にすると紙が抜けてコルクに溶け、画びょうが宙に浮いて見えるので、不透明のまま色だけ変える
   */
  paperRead: "#dcc48e",
  /** 紙のふち */
  paperEdge: "#d6bd86",
  /** 読んだあとの紙のふち（紙に合わせて濃く） */
  paperReadEdge: "#b8975a",
  /** 紙に書く文字（薄め） */
  ink: "#6a4a2e",
  /** 未読の画びょう */
  pinRed: "#d4483b",
  /** 既読の画びょう */
  pinGray: "#8c8f96",
  /** 画びょうの光 */
  pinShine: "#ffd9d2",
  /** 「あたらしい」のはんこ */
  stamp: "#c0392b",
  /** 連続記録の炎 */
  flame: "#e8701a",
  /** エラーの文字（羊皮紙の上で読める濃さ） */
  error: "#a3261b",
} as const;

const C = NOTICE_BOARD_COLORS;

export const noticeBoardStyles = StyleSheet.create({
  safeArea: { backgroundColor: C.plaza, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  eyebrow: { color: CHILD_THEME.gold, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  screenTitle: { color: CHILD_THEME.parchment, fontSize: 28, fontWeight: "900", marginTop: 1 },
  unreadBadge: {
    alignItems: "center",
    backgroundColor: C.roofWood,
    borderColor: CHILD_THEME.gold,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unreadBadgeLabel: { color: CHILD_THEME.parchment, fontSize: 11, fontWeight: "800" },
  unreadBadgeValue: { color: CHILD_THEME.brightYellow, fontSize: 18, fontWeight: "900" },

  // 掲示板の本体 ---------------------------------------------------------------
  board: { flex: 1, marginHorizontal: 10 },
  roof: {
    alignItems: "center",
    backgroundColor: C.roofWood,
    borderColor: C.frameEdge,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 3,
    marginHorizontal: -4,
    paddingBottom: 6,
    paddingTop: 10,
  },
  titleSign: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: CHILD_THEME.darkWood,
    borderRadius: 6,
    borderWidth: 3,
    paddingHorizontal: 26,
    paddingVertical: 4,
    transform: [{ rotate: "-1.5deg" }],
  },
  titleSignText: { color: CHILD_THEME.darkWood, fontSize: 17, fontWeight: "900", letterSpacing: 4 },
  frame: {
    backgroundColor: C.frameWood,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderColor: C.frameEdge,
    borderTopWidth: 0,
    borderWidth: 3,
    flex: 1,
    padding: 8,
    paddingBottom: 16,
  },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tab: {
    alignItems: "center",
    backgroundColor: C.roofWood,
    borderColor: C.roofWood,
    borderRadius: 10,
    borderWidth: 2,
    flex: 1,
    paddingVertical: 7,
  },
  tabActive: { backgroundColor: CHILD_THEME.parchment, borderColor: CHILD_THEME.gold },
  tabText: { color: CHILD_THEME.fadedBeige, fontSize: 14, fontWeight: "900" },
  tabTextActive: { color: CHILD_THEME.darkWood },
  cork: {
    backgroundColor: C.cork,
    borderColor: C.roofWood,
    borderRadius: 4,
    borderWidth: 3,
    flex: 1,
    overflow: "hidden",
  },
  corkSpeck: { borderRadius: 3, opacity: 0.8, position: "absolute" },
  corkContent: { gap: 16, paddingBottom: 24, paddingHorizontal: 14, paddingTop: 14 },
  rivet: {
    backgroundColor: CHILD_THEME.rivetBrass,
    borderColor: CHILD_THEME.rivetEdge,
    borderRadius: 5,
    borderWidth: 1,
    bottom: 3,
    height: 10,
    position: "absolute",
    width: 10,
  },
  legLeft: {
    backgroundColor: C.roofWood,
    height: 14,
    left: 26,
    position: "absolute",
    bottom: -14,
    width: 14,
  },
  legRight: {
    backgroundColor: C.roofWood,
    height: 14,
    position: "absolute",
    bottom: -14,
    right: 26,
    width: 14,
  },

  // 一覧のまわり --------------------------------------------------------------
  boardMessage: {
    alignSelf: "center",
    backgroundColor: CHILD_THEME.parchment,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  boardMessageText: { color: C.ink, fontSize: 12, fontWeight: "700", textAlign: "center" },
  errorText: { color: C.error, fontSize: 13, fontWeight: "800", textAlign: "center" },
  markAllButton: {
    alignSelf: "flex-end",
    backgroundColor: C.roofWood,
    borderColor: CHILD_THEME.gold,
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  markAllText: { color: CHILD_THEME.parchment, fontSize: 12, fontWeight: "900" },
  emptyNote: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: C.paperRead,
    borderColor: C.paperEdge,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 16,
    transform: [{ rotate: "-2deg" }],
  },
  emptyText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  loading: { alignItems: "center", paddingVertical: 48 },
  pressed: { opacity: 0.75 },

  // お知らせの紙 --------------------------------------------------------------
  note: {
    backgroundColor: C.paper,
    borderColor: C.paperEdge,
    borderRadius: 3,
    borderWidth: 1,
    elevation: 4,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 18,
    shadowColor: CHILD_THEME.shadow,
    shadowOffset: { height: 3, width: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  noteRead: { backgroundColor: C.paperRead, borderColor: C.paperReadEdge },
  // 紙の上の辺に刺して、頭の半分以上を紙の外へ出す。題名（paddingTop: 18）とは重ならない（Issue #486）
  pin: {
    alignSelf: "center",
    borderColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    position: "absolute",
    top: -11,
    width: 16,
  },
  pinShine: {
    backgroundColor: C.pinShine,
    borderRadius: 2,
    height: 4,
    left: 3,
    position: "absolute",
    top: 3,
    width: 4,
  },
  stamp: {
    borderColor: C.stamp,
    borderRadius: 4,
    borderWidth: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: "absolute",
    right: 8,
    top: 8,
    transform: [{ rotate: "8deg" }],
  },
  stampText: { color: C.stamp, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  noteTitle: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900", paddingRight: 64 },
  noteTitleRead: { fontWeight: "700", paddingRight: 0 },
  noteBody: { color: C.ink, fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 6 },
  noteFooter: {
    alignItems: "center",
    borderTopColor: C.paperEdge,
    borderStyle: "dashed",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 6,
  },
  noteTime: { color: C.ink, fontSize: 11, fontWeight: "700" },
  noteGo: { color: CHILD_THEME.darkWood, fontSize: 12, fontWeight: "900" },

  // 連続記録の紙 --------------------------------------------------------------
  streakNote: {
    backgroundColor: C.paper,
    borderColor: C.paperEdge,
    borderRadius: 3,
    borderWidth: 1,
    elevation: 4,
    gap: 6,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 16,
    shadowColor: CHILD_THEME.shadow,
    shadowOffset: { height: 3, width: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    transform: [{ rotate: "0.6deg" }],
  },
  streakPinLeft: { left: 10, top: -6 },
  streakPinRight: { right: 10, top: -6 },
  streakHeading: { alignItems: "center", flexDirection: "row", gap: 4 },
  streakTitle: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900" },
  streakGuide: { color: C.ink, fontSize: 11, fontWeight: "600", lineHeight: 16 },
  streakRow: {
    alignItems: "center",
    borderTopColor: C.paperEdge,
    borderStyle: "dashed",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  streakPerson: { flex: 1, paddingRight: 8 },
  streakName: { color: CHILD_THEME.darkWood, fontSize: 14, fontWeight: "900" },
  streakSelf: { color: C.ink, fontSize: 11, fontWeight: "700" },
  streakNext: { color: C.ink, fontSize: 11, fontWeight: "700", marginTop: 2 },
  streakDays: { color: C.flame, fontSize: 18, fontWeight: "900" },
  streakDaysZero: { color: C.ink, fontSize: 13 },

  // 下のボタン ----------------------------------------------------------------
  footer: { paddingHorizontal: 14, paddingBottom: 6, paddingTop: 22 },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: C.roofWood,
    borderColor: CHILD_THEME.gold,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backArrow: { color: CHILD_THEME.parchment, fontSize: 22, fontWeight: "900", marginTop: -3 },
  backButtonText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "900" },
});
