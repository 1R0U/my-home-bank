/**
 * 画面をまたいで使う、見た目と文言の定数（Issue #217）。
 *
 * ここに置くのは「複数の画面が同じものを使っていて、変えるときは揃って変わるべきもの」。
 * 1つの画面でしか使わない値は、その画面のそばに置く。
 */

/**
 * Tailwind の `slate-400`。
 *
 * `placeholderTextColor` や `Ionicons` の `color` は className を受け取れず、色を
 * 直接渡すしかない。そのため同じリテラルが23箇所に散っていた。
 * 用途ごとに名前を付けて公開し、値はここ1か所だけに置く。
 */
const SLATE_400 = "#94a3b8";

/**
 * className を受け取れない場所（`Ionicons` の `color`、`ActivityIndicator` の `color`、
 * `placeholderTextColor` など）へ渡す色（Issue #399）。
 *
 * 値は Tailwind の同名の色と同じにしてある。className 側で `text-slate-900` を使っている
 * 画面なら、アイコンにも `UI_COLORS.slate900` を渡せば揃う。
 * **画面のファイルに `"#0f172a"` のような色を直書きしない。** ここに無い色が要るときは
 * ここに足す（tests/uiColorLiterals.test.mjs が直書きを検出する）。
 */
export const UI_COLORS = {
  white: "#ffffff",
  slate300: "#cbd5e1",
  slate400: SLATE_400,
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate900: "#0f172a",
  blue600: "#2563eb",
  amber700: "#b45309",
  orange500: "#f97316",
  rose700: "#be123c",
} as const;

/** 入力欄のプレースホルダの色 */
export const PLACEHOLDER_TEXT_COLOR = SLATE_400;

/** 目立たせないアイコンの色（未選択のタブ、プロフィール画像の代わりなど） */
export const MUTED_ICON_COLOR = SLATE_400;

/**
 * 実データに書き込めない状態（プレビュー中）で、操作を止めていることを伝える文言。
 *
 * モックアカウントで入った場合など、IDがUUIDでないと書き込みが必ず失敗するため
 * ボタンを無効にしている（#174）。その理由を画面に出すための文言。
 *
 * 以前は5箇所に直書きされており、銀行だけ「ボタンを」が抜けていた。
 */
export const PREVIEW_DISABLED_NOTICE = "※ プレビュー中はボタンを操作できません";
/** 選択中のタブのアイコンの色（Tailwind の blue-600） */
export const ACTIVE_ICON_COLOR = UI_COLORS.blue600;

/**
 * RPGハブの町の空の色（春）。3Dシーンが描かれるまでの間、WebView の背景に使う。
 * 季節ごとの空の色は lib/rpg-hub/seasonalLook.ts が持っている。
 */
export const RPG_HUB_SKY_COLOR = "#dff4ff";

/**
 * 送信できない理由などを伝える注記の文字色（Issue #272）。
 *
 * 以前は `text-slate-300` で、背景とのコントラスト比が 1.36〜1.48 しかなくほぼ読めなかった。
 * 白・`slate-50`・`slate-100` のどの背景でも WCAG AA（小さな文字で 4.5 以上）を満たす色の
 * うち、いちばん薄いものにしてある（`slate-500` は `slate-100` の上で 4.34 と足りない）。
 *
 * className に渡す文字列なので、tailwind.config.js の `content` に constants/ を含めている。
 */
export const NOTICE_TEXT_CLASS = "text-slate-600";

/**
 * エラー表示の文字色（Issue #272）。
 *
 * 以前の `text-rose-500` は、`slate-100` の上で 3.35 と WCAG AA を満たしていなかった。
 * 注記と同じ基準で選んである（`rose-600` は `slate-100` の上で 4.29 と足りない）。
 */
export const ERROR_TEXT_CLASS = "text-rose-700";
