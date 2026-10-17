import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/** 羊皮紙の上に置く、薄いほうの茶色の文字（銀行の残高の見出しと同じ） */
const MUTED_BROWN = "#69462d";
/** 羊皮紙の上で読めるエラーの赤 */
const ERROR_RED = "#9b2c2c";
/** 入力欄の背景 */
const INPUT_PAPER = "#fffaf0";

/** 入力欄の見本の文字色。TextInput の `placeholderTextColor` はスタイルで渡せないため別に出す */
export const CHILD_LOAN_PLACEHOLDER_COLOR = "#a08a6a";

/**
 * 子供用の銀行画面のローン欄（`ChildLoanPanel`）のスタイル（Issue #437）。
 *
 * 木の枠・看板・羊皮紙の札・押せるボタンは銀行画面（`bank/bankStyles.ts`）のものを使い、
 * ここにはローン欄にしか出てこないもの（入力欄・契約1件ぶんの札など）だけを置く。
 */
export const childLoanStyles = StyleSheet.create({
  /** 木の枠の上に置く説明の文字 */
  frameNote: { color: CHILD_THEME.parchment, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center" },
  frameNoteMuted: { color: CHILD_THEME.fadedBeige, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center" },
  /** 羊皮紙の札の中の小さい文字 */
  cardNote: { color: MUTED_BROWN, fontSize: 12, fontWeight: "700", marginTop: 4 },
  cardStrong: { color: CHILD_THEME.darkWood, fontSize: 15, fontWeight: "900", marginTop: 4 },
  errorText: { color: ERROR_RED, fontSize: 12, fontWeight: "800", marginTop: 6 },
  fieldLabel: { color: MUTED_BROWN, fontSize: 13, fontWeight: "800", marginTop: 10 },
  input: {
    backgroundColor: INPUT_PAPER,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 2,
    color: CHILD_THEME.darkWood,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputLocked: { opacity: 0.6 },
  /** 「さいだいを いれる」など、文字だけの小さいボタン */
  textButton: { alignSelf: "flex-start", paddingVertical: 8 },
  textButtonCenter: { alignSelf: "center", paddingVertical: 8 },
  textButtonText: { color: "#8a4b12", fontSize: 14, fontWeight: "900", textDecorationLine: "underline" },
  textButtonDisabled: { opacity: 0.4 },
  /** 申請前の、返済の見込み */
  preview: {
    backgroundColor: INPUT_PAPER,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  /**
   * 申請・返済のボタン。銀行の預入・引き出しのボタン（`bankStyles.actionButton`）と同じ見た目だが、
   * あちらは横に2つ並べるため `flex: 1` を持つ。縦に積むここでは使えないので、幅いっぱいの別のスタイルにする
   */
  actionButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: 12,
    paddingVertical: 14,
  },
  sectionTitle: { color: CHILD_THEME.parchment, fontSize: 16, fontWeight: "900", marginTop: 4 },
  /** 契約・申請1件ぶんの札 */
  loanRowHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  loanPurpose: { color: CHILD_THEME.darkWood, flex: 1, fontSize: 15, fontWeight: "900" },
  status: { color: MUTED_BROWN, fontSize: 12, fontWeight: "900" },
  statusOverdue: { color: ERROR_RED },
  repayArea: { borderTopColor: CHILD_THEME.fadedBeige, borderTopWidth: 1, marginTop: 10, paddingTop: 6 },
});
