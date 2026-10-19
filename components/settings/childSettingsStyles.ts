import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用の設定画面（`ChildSettingsScreen`）のスタイル（Issue #439）。
 *
 * タスク画面（`tasks/taskStyles.ts`）と同じ、木の枠に羊皮紙の板を置いた世界観で作る。
 * 枠・板・戻るボタンの色と大きさは、タスク画面にそろえている。
 */

/** 板の上に置く文字の、薄いほうの茶色（羊皮紙の上でも読める濃さ） */
const MUTED_BROWN = "#6b4a2e";
/** 板の上で読めるエラーの赤（タスク画面の取得エラーと同じ） */
const ERROR_RED = "#9b2c2c";
/** 紙のカード */
const PAPER = "#f8efd6";
/** 入力欄の背景 */
const INPUT_PAPER = "#fffaf0";

/** 入力欄の見本の文字色。TextInput の `placeholderTextColor` はスタイルで渡せないため別に出す */
export const CHILD_SETTINGS_PLACEHOLDER_COLOR = "#8a6f52";

export const childSettingsStyles = StyleSheet.create({
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
  screenTitle: { color: CHILD_THEME.parchment, fontSize: 28, fontWeight: "900", marginTop: 1 },
  boardFrame: {
    backgroundColor: "#e4cd94",
    borderColor: "#9d7950",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 4,
    flex: 1,
    marginHorizontal: 9,
    overflow: "hidden",
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 12, padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: PAPER,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 12,
    borderWidth: 2,
    overflow: "hidden",
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: PAPER,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  nameRow: {
    alignItems: "center",
    borderBottomColor: CHILD_THEME.fadedBeige,
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    paddingBottom: 6,
    width: "100%",
  },
  nameInput: { color: CHILD_THEME.darkWood, flex: 1, fontSize: 17, fontWeight: "800" },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionHeaderPressed: { backgroundColor: "#efe2bf" },
  sectionTitle: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900" },
  sectionChevron: { color: MUTED_BROWN, fontSize: 14, fontWeight: "900" },
  sectionBody: {
    borderTopColor: CHILD_THEME.fadedBeige,
    borderTopWidth: 1,
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldGroup: { gap: 6 },
  label: { color: MUTED_BROWN, fontSize: 13, fontWeight: "800" },
  value: { color: CHILD_THEME.darkWood, fontSize: 14, fontWeight: "900" },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  input: {
    backgroundColor: INPUT_PAPER,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 8,
    borderWidth: 2,
    color: CHILD_THEME.darkWood,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#efe2bf",
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipSelected: { backgroundColor: CHILD_THEME.darkWood, borderColor: CHILD_THEME.darkWood },
  chipText: { color: CHILD_THEME.darkWood, fontSize: 13, fontWeight: "800" },
  chipTextSelected: { color: CHILD_THEME.parchment },
  saveButton: {
    alignSelf: "flex-end",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  saveButtonInProfile: { marginTop: 14 },
  saveButtonDisabled: { backgroundColor: "#d8c9a4", borderColor: "#d8c9a4" },
  saveButtonText: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "900" },
  buttonPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  note: { color: MUTED_BROWN, fontSize: 12 },
  creditItem: { gap: 3 },
  creditItemDivider: { borderTopColor: CHILD_THEME.fadedBeige, borderTopWidth: 1, paddingTop: 10 },
  creditTitle: { color: CHILD_THEME.darkWood, fontSize: 14, fontWeight: "900" },
  creditText: { color: MUTED_BROWN, fontSize: 12 },
  errorText: { color: ERROR_RED, fontSize: 13, fontWeight: "700", textAlign: "center" },
  logoutButton: {
    alignItems: "center",
    backgroundColor: PAPER,
    borderColor: ERROR_RED,
    borderRadius: 10,
    borderWidth: 2,
    paddingVertical: 12,
  },
  logoutButtonDisabled: { borderColor: CHILD_THEME.fadedBeige },
  logoutText: { color: ERROR_RED, fontSize: 16, fontWeight: "900" },
  footer: {
    alignItems: "center",
    backgroundColor: "#7a4b28",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 11,
  },
  backButton: {
    alignItems: "center",
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    minWidth: 122,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backArrow: { color: CHILD_THEME.parchment, fontSize: 30, fontWeight: "800", lineHeight: 22, marginRight: 8 },
  backText: { color: CHILD_THEME.parchment, fontSize: 18, fontWeight: "800" },
});
