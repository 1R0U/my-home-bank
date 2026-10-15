/**
 * 子供用UIの基本色（Issue #217）。
 *
 * タスク画面（`tasks/taskStyles.ts`）とストア画面（`store/storeStyles.ts`）、
 * 掲示板（`notifications/noticeBoardStyles.ts`）は木と羊皮紙の同じ世界観で作られており、
 * 同じ色が出てくる。**2つ以上の画面で使われている色だけ**をここに置く。
 *
 * 片方の画面にしか出てこない色は、そのスタイルシートに残したままにしている。
 * ここへ全部集めると「どこで使う色なのか」が読めなくなり、数も多い
 * （taskStyles 側に59色、storeStyles 側に28色）。
 *
 * **値は変えないこと。** 見た目を変えるためのファイルではなく、
 * 同じ色が2か所に書かれている状態をなくすためのもの。
 */
export const CHILD_THEME = {
  /** 濃い茶。木の板に置く文字 */
  darkWood: "#402416",
  /** くすんだベージュ。枠線 */
  fadedBeige: "#c2aa80",
  /** 金色。枠線や見出し */
  gold: "#d6b66a",
  /** 明るい黄。押せるものの背景 */
  brightYellow: "#f2c94c",
  /** 淡い黄。明るい面のふち */
  paleYellow: "#fff0a6",
  /** 生成り。濃い背景に置く文字 */
  parchment: "#fff8de",
  /** 真鍮色。木の枠を留める金具 */
  rivetBrass: "#d5a84d",
  /** こげ茶。金具のふち */
  rivetEdge: "#513018",
  /** 影の色 */
  shadow: "#000000",
} as const;
