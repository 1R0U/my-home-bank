import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用の商品追加申請画面（`StoreItemRequestScreen`）の配色（Issue #488）。
 *
 * 画面の外枠（背景・見出し・木の枠・フッター）はストア画面の `storeStyles` をそのまま使い、
 * ここには枠の中に置く申請用紙と入力欄の見た目だけを置く。
 * 申請用紙はストアの購入確認（`modalCard`）と同じ、金のふちの紫の板にしている。
 * TextInput の `placeholderTextColor` など、style で渡せない色もここに置く。
 */
export const STORE_ITEM_REQUEST_COLORS = {
  /** 入力欄の見本の文字（濃い入力欄の上で、入力済みの文字と見分けられる薄さ） */
  placeholder: "#8d8896",
} as const;

export const storeItemRequestStyles = StyleSheet.create({
  scrollContent: { paddingBottom: 8 },
  form: {
    backgroundColor: "#2a2135",
    borderColor: CHILD_THEME.gold,
    borderRadius: 18,
    borderWidth: 3,
    padding: 16,
  },
  fieldLabel: { color: CHILD_THEME.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  fieldLabelSpaced: { marginTop: 16 },
  imagePicker: {
    alignItems: "center",
    backgroundColor: "#17121b",
    borderColor: CHILD_THEME.gold,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 2,
    height: 160,
    justifyContent: "center",
    marginTop: 6,
    overflow: "hidden",
  },
  // 画像を選んだ後は、ストアの商品画像と同じ実線のふちにする
  imagePickerSelected: { borderStyle: "solid" },
  imagePickerPressed: { opacity: 0.8 },
  image: { height: "100%", width: "100%" },
  imagePickerText: { color: "#c7bca8", fontSize: 13, fontWeight: "700", marginTop: 6 },
  input: {
    backgroundColor: "#17121b",
    borderColor: "#5a4a6e",
    borderRadius: 10,
    borderWidth: 2,
    color: CHILD_THEME.parchment,
    fontSize: 15,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  submitButton: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.gold,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: 22,
    paddingVertical: 13,
  },
  submitButtonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  submitButtonDisabled: { backgroundColor: "#4a4256", borderColor: "#5a4a6e" },
  submitButtonText: { color: "#2a1f10", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  submitButtonTextDisabled: { color: "#8d8896" },
  // 送信ボタンの下の注記（SubmitGateNotice）。紫の板の上で読める明るさにする
  notice: { color: "#c7bca8", fontSize: 12, fontWeight: "700", marginTop: 10, textAlign: "center" },
  errorNotice: { color: "#f28b82", fontSize: 12, fontWeight: "700", marginTop: 10, textAlign: "center" },
  // 未ログインのときの表示（枠を出さず、背景の上に文言だけを置く）
  loginContainer: { alignItems: "center", justifyContent: "center" },
  loginText: { color: CHILD_THEME.parchment, fontSize: 14, fontWeight: "700" },
});
