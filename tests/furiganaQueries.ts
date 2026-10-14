import { screen } from "@testing-library/react-native";

/*
 * ふりがな付きの文言（components/Furigana.tsx、Issue #347）を探すための描画テスト用ヘルパー。
 *
 * 子供が見ている画面では、ふりがなを付けた文言は1文字ずつの箱に分かれるため、
 * getByText では見つからない。代わりに読み上げ用のまとまり（role="text"、ラベルが
 * 記法を除いた文言）から探す。
 */

type TextMatch = string | RegExp;

/** ふりがな付きの文言を、記法を除いた文言で探す */
export function getByFuriganaText(text: TextMatch) {
  return screen.getByRole("text", { name: text });
}

/** ふりがな付きの文言を探す。無ければ null */
export function queryByFuriganaText(text: TextMatch) {
  return screen.queryByRole("text", { name: text });
}

/** ふりがな付きの文言が出るまで待って探す */
export function findByFuriganaText(text: TextMatch) {
  return screen.findByRole("text", { name: text });
}

/**
 * ラベルで入力欄を探す。
 * 入力欄の見出し（ふりがな付き）にも同じ読み上げ用ラベルが付くので、getByLabelText では2つ見つかる。
 */
export function getInputByLabel(label: TextMatch) {
  const input = screen.getAllByLabelText(label).find((element) => element.type === "TextInput");
  if (!input) throw new Error(`入力欄「${String(label)}」が見つかりません`);
  return input;
}
