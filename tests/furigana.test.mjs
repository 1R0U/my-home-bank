import assert from "node:assert/strict";
import test from "node:test";
import { parseFurigana, stripFurigana } from "../lib/furigana.ts";

/** まとまりを読みやすい文字列にする。部分は `本文(よみ)`、まとまりの切れ目は `/` */
function describe(markup) {
  return parseFurigana(markup)
    .map((chunk) =>
      chunk.kind === "newline" ? "⏎" : chunk.parts.map((p) => (p.ruby ? `${p.base}(${p.ruby})` : p.base)).join(""),
    )
    .join("/");
}

test("{漢字|よみ} にふりがなを付け、それ以外は1文字ずつに分ける", () => {
  assert.equal(describe("{積立|つみたて}の{日|ひ}"), "積立(つみたて)/の/日(ひ)");
});

test("ふりがなの部分と、くっつけた文字は別の部分にする", () => {
  // 読みが「積立。」の真ん中に寄ってずれないよう、句点はふりがなの外に置く
  const [chunk] = parseFurigana("{積立|つみたて}。");
  assert.deepEqual(chunk, {
    kind: "text",
    parts: [
      { base: "積立", ruby: "つみたて" },
      { base: "。", ruby: null },
    ],
  });
});

test("句読点・閉じかっこ・小さい仮名・長音は行頭に来ないよう前へくっつける", () => {
  assert.equal(describe("あ、い。"), "あ、/い。");
  assert.equal(describe("「{家|いえ}」"), "「家(いえ)」");
  assert.equal(describe("きょう"), "きょ/う");
  assert.equal(describe("ゲーム"), "ゲー/ム");
});

test("開きかっこは行末に残らないよう次へくっつける", () => {
  assert.equal(describe("あ（{停止|ていし}）"), "あ/（停止(ていし)）");
});

test("英数字のひと続きと、桁区切りの数字は途中で折り返さない", () => {
  assert.equal(describe("1,000 gol"), "1,000/ /gol");
  assert.equal(describe("3.5%"), "3.5%");
  // 数字にはさまれていない読点は区切りとして扱う
  assert.equal(describe("1,あ"), "1,/あ");
});

test("改行は newline になり、前後の文字を落とさない", () => {
  assert.equal(describe("あ\nい"), "あ/⏎/い");
  assert.equal(describe("「\nあ"), "「/⏎/あ");
});

test("閉じていない記法は、そのままの文字として扱う", () => {
  assert.equal(stripFurigana("{漢字"), "{漢字");
  assert.equal(describe("{漢|"), "{漢/|");
  assert.equal(describe("「"), "「");
});

test("stripFurigana は記法だけを取り除く", () => {
  assert.equal(stripFurigana("{毎月|まいつき}の{積立額|つみたてがく}：100 gol"), "毎月の積立額：100 gol");
  assert.equal(stripFurigana("ふりがな なし"), "ふりがな なし");
});
