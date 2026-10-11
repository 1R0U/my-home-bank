/**
 * ふりがな付きの文言を、表示用のまとまりに分ける（Issue #347）。
 *
 * 文言の中に `{漢字|よみ}` と書いた所にふりがなを付ける。例: `{積立|つみたて}の{日|ひ}`。
 * 部品（`components/Furigana.tsx`）は、部分（`FuriganaPart`）ごとに「上にふりがな・下に本文」の
 * 縦の箱を作り、まとまり（`FuriganaChunk`）の切れ目でだけ折り返す。
 *
 * React Native にはルビの仕組みが無いため、文章を1文字ずつの箱に分けて並べている。
 * そのまま1文字ずつにすると、行頭に「。」が来たり、「1,000」や「gol」が途中で
 * 折り返したりするので、それを避けるまとめ方もここで決める。
 */

/** ふりがなを付ける単位。`ruby` が null なら、ふりがなを付けない */
export type FuriganaPart = { base: string; ruby: string | null };

/** 途中で折り返さないまとまり。`newline` は改行 */
export type FuriganaChunk = { kind: "text"; parts: FuriganaPart[] } | { kind: "newline" };

const RUBY_PATTERN = /\{([^{}|]+)\|([^{}|]+)\}/g;

/** 行頭に来ないよう、前のまとまりにくっつける文字（句読点・閉じかっこ・小さい仮名など） */
const NO_LINE_START = new Set(
  "、。，．,.!?！？)）」』】〕〉》］]}｝ー〜～…・:：;；ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ%％".split(""),
);

/** 行末に残らないよう、次のまとまりにくっつける文字（開きかっこなど） */
const NO_LINE_END = new Set("(（「『【〔〈《［[{｛".split(""));

/** 途中で折り返さない、ひと続きの英数字（`1,000`・`gol` など） */
const WORD_CHAR = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/;

/**
 * ふりがなの記法を取り除いた、読み上げ・検索用の文言を返す。
 * @param markup - `{漢字|よみ}` を含む文言
 * @returns 記法を除いた文言（`{積立|つみたて}` → `積立`）
 */
export function stripFurigana(markup: string): string {
  return markup.replace(RUBY_PATTERN, "$1");
}

/**
 * まとまりの最後の部分へ、ふりがなの無い文字を足す。
 * 最後の部分にふりがなが付いているときは、読みの位置がずれないよう別の部分にする。
 */
function appendPlain(parts: FuriganaPart[], text: string) {
  const last = parts[parts.length - 1];
  if (last && last.ruby === null) {
    last.base += text;
  } else {
    parts.push({ base: text, ruby: null });
  }
}

/**
 * 文言を、折り返してよい切れ目ごとのまとまりに分ける。
 *
 * - `{漢字|よみ}` は、ふりがな付きの1つの部分
 * - それ以外は1文字ずつのまとまり。ただし英数字のひと続きは1つにまとめる
 * - 句読点・閉じかっこなどは前のまとまりへ、開きかっこは次のまとまりへくっつける
 * - 改行（`\n`）は `newline` にする
 *
 * 閉じていない `{` などは、記法ではなくそのままの文字として扱う。
 * @param markup - `{漢字|よみ}` を含む文言
 * @returns 表示用のまとまりの並び
 */
export function parseFurigana(markup: string): FuriganaChunk[] {
  const chunks: FuriganaChunk[] = [];
  // 開きかっこのように、次のまとまりの頭へ付ける文字をためておく
  let pendingPrefix = "";

  const pushChunk = (part: FuriganaPart) => {
    const parts: FuriganaPart[] = [];
    if (pendingPrefix) parts.push({ base: pendingPrefix, ruby: null });
    pendingPrefix = "";
    if (part.ruby === null) {
      appendPlain(parts, part.base);
    } else {
      parts.push(part);
    }
    chunks.push({ kind: "text", parts });
  };

  const flushPrefix = () => {
    if (pendingPrefix) {
      chunks.push({ kind: "text", parts: [{ base: pendingPrefix, ruby: null }] });
      pendingPrefix = "";
    }
  };

  const pushPlain = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (char === "\n") {
        flushPrefix();
        chunks.push({ kind: "newline" });
        continue;
      }

      const last = chunks[chunks.length - 1];
      if (NO_LINE_START.has(char) && !pendingPrefix && last?.kind === "text") {
        appendPlain(last.parts, char);
        continue;
      }

      if (NO_LINE_END.has(char)) {
        pendingPrefix += char;
        continue;
      }

      if (WORD_CHAR.test(char)) {
        let end = i + 1;
        // 「1,000」「3.5」のように、数字にはさまれた区切りも同じ語として扱う
        while (
          end < text.length &&
          (WORD_CHAR.test(text[end]) ||
            ((text[end] === "," || text[end] === ".") && /[0-9]/.test(text[end - 1]) && /[0-9]/.test(text[end + 1] ?? "")))
        ) {
          end += 1;
        }
        pushChunk({ base: text.slice(i, end), ruby: null });
        i = end - 1;
        continue;
      }

      pushChunk({ base: char, ruby: null });
    }
  };

  let cursor = 0;
  for (const match of markup.matchAll(RUBY_PATTERN)) {
    pushPlain(markup.slice(cursor, match.index));
    pushChunk({ base: match[1], ruby: match[2] });
    cursor = match.index + match[0].length;
  }
  pushPlain(markup.slice(cursor));

  // 末尾に開きかっこだけが残ったときも、文字を落とさない
  flushPrefix();

  return chunks;
}
