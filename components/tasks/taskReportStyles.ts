import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用のお手伝い報告画面（`TaskReportScreen`）の配色（Issue #487）。
 *
 * 画面の外枠（木の板・見出し・フッター）はタスク画面の `taskStyles` をそのまま使い、
 * ここには板の上に置く報告用紙（羊皮紙）と入力欄の見た目だけを置く。
 * TextInput の `placeholderTextColor` など、style で渡せない色もここに置く。
 */
export const TASK_REPORT_COLORS = {
  /** 入力欄の見本の文字（羊皮紙の上で入力済みの文字と見分けられる薄さ） */
  placeholder: "#a8916c",
} as const;

export const taskReportStyles = StyleSheet.create({
  scrollContent: { paddingBottom: 16, paddingTop: 14 },
  // タスクの詳細パネルと同じ、板に留めた紙
  paper: {
    backgroundColor: "#fff8e5",
    borderColor: "#87643a",
    borderRadius: 8,
    borderWidth: 2,
    padding: 16,
    paddingTop: 22,
    position: "relative",
    shadowColor: "#4a321d",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  paperPin: {
    backgroundColor: "#8a8f99",
    borderColor: "#3a3d42",
    borderRadius: 6,
    borderWidth: 1,
    height: 12,
    left: "50%",
    marginLeft: -6,
    position: "absolute",
    top: -6,
    width: 12,
    zIndex: 2,
  },
  fieldLabel: { color: "#8c6638", fontSize: 12, fontWeight: "900" },
  fieldLabelSpaced: { marginTop: 16 },
  input: {
    backgroundColor: "#f8efd6",
    borderColor: "#d5bd8c",
    borderRadius: 8,
    borderWidth: 2,
    color: "#36291d",
    fontSize: 15,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#c57d35",
    borderColor: "#805020",
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 22,
    paddingVertical: 13,
  },
  submitButtonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  submitButtonDisabled: { backgroundColor: "#d2cdc2", borderColor: "#aaa49a" },
  submitButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  submitButtonTextDisabled: { color: "#8d8981" },
  // 送信ボタンの下の注記（SubmitGateNotice）。羊皮紙の上で読める濃さにする
  notice: { color: "#75634d", fontSize: 12, fontWeight: "700", marginTop: 10, textAlign: "center" },
  errorNotice: { color: "#9b2c2c", fontSize: 12, fontWeight: "700", marginTop: 10, textAlign: "center" },
  // 未ログインのときの表示（板を出さず、木の背景の上に文言だけを置く）
  loginContainer: { alignItems: "center", justifyContent: "center" },
  loginText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "700" },
});
