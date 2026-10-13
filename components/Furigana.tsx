import { useMemo, useRef, useState } from "react";
import { cssInterop } from "nativewind";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { parseFurigana, stripFurigana } from "../lib/furigana";
import { useActiveRole } from "../store";

/** 本文の文字に渡すスタイル。これ以外（余白・幅・背景など）は外側の箱に渡す */
const TEXT_STYLE_KEYS = new Set<string>([
  "color",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textDecorationColor",
  "textDecorationLine",
  "textDecorationStyle",
  "textShadowColor",
  "textShadowOffset",
  "textShadowRadius",
  "textTransform",
]);

/** React Native の Text の既定の文字の大きさ */
const DEFAULT_FONT_SIZE = 14;
/** ふりがなの大きさ（本文に対する割合） */
const RUBY_SCALE = 0.5;
/** 小さすぎて読めなくならないための下限 */
const MIN_RUBY_FONT_SIZE = 7;

const JUSTIFY_BY_TEXT_ALIGN: Record<string, ViewStyle["justifyContent"]> = {
  center: "center",
  right: "flex-end",
};

type FuriganaProps = {
  /** 表示する文言。`{漢字|よみ}` と書いた所にふりがなを付ける（`lib/furigana.ts`） */
  children: string;
  /** Text と同じように渡せる。文字の見た目は本文へ、余白などは外側の箱へ振り分ける */
  style?: StyleProp<TextStyle>;
  /** ふりがなだけに足すスタイル */
  rubyStyle?: StyleProp<TextStyle>;
  /** 大人用の画面と同じく className でも書ける（`style` に変換される） */
  className?: string;
  /** 読み上げでの役割。エラーの通知などで使う（既定は文字） */
  accessibilityRole?: "alert" | "header" | "text";
  /**
   * 指定すると、ふりがな付きの表示は1行で並べ、幅に収まらないときだけ
   * ふりがなの無い普通の Text に切り替えて末尾を省略する（ふりがな付きのまま「…」で省略はできない）。
   */
  numberOfLines?: number;
  ellipsizeMode?: TextProps["ellipsizeMode"];
  /**
   * 折り返さずに1行で出す。ボタン・タブ・バッジなど短いラベルに付ける。
   * 中身の幅に合わせて大きさが決まる場所では、文字幅の端数のずれで最後の1文字だけが
   * 次の行へ押し出されることがある（町の「入る」ボタンが「入／る」の2行になった）。
   */
  noWrap?: boolean;
  testID?: string;
};

/**
 * 漢字の上に小さくふりがなを付けて表示する（Issue #347）。
 *
 * 子供が読めない漢字のための部品で、**大人が見ているときはふりがなを付けず**、
 * 記法を取り除いた普通の Text として表示する（銀行など、大人と子供で同じ画面があるため）。
 *
 * React Native にはルビの仕組みが無いので、文言を折り返してよい切れ目ごとの箱に分け、
 * 横に並べて折り返している。そのため **`<Text>` の中には入れられない**（Text の中に
 * View を置くことになる）。文言の途中に数字などを入れたいときは、
 * テンプレート文字列で1つの文言にまとめて渡す。
 *
 * 読み上げでは、記法を除いた文言を1つのまとまりとして読む。
 * **ボタンなど押せる部品の中に置くときは、その部品に `accessibilityLabel` を付ける。**
 * 付けないと、部品の名前が中の文字から組み立てられ、ふりがなまで読まれることがある。
 */
export default function Furigana({
  accessibilityRole,
  children,
  ellipsizeMode,
  noWrap = false,
  numberOfLines,
  rubyStyle,
  style,
  testID,
}: FuriganaProps) {
  const role = useActiveRole();
  const plain = stripFurigana(children);
  const chunks = useMemo(() => parseFurigana(children), [children]);
  const hasRuby = chunks.some((chunk) => chunk.kind === "text" && chunk.parts.some((part) => part.ruby !== null));
  const truncates = numberOfLines !== undefined;
  // 幅に収まらなかった文言と、ふりがな付きで1行に並べたときの幅。
  // 文言が変われば、もう一度ふりがな付きで並べて測り直す
  const [overflow, setOverflow] = useState<{ contentWidth: number; text: string } | null>(null);
  const widths = useRef({ box: 0, content: 0 });
  // 文言が変わったら測った幅を捨てる。前の文言の幅が残っていると、外側の箱の幅が
  // 中身より先に届いたときに、新しい文言まで「はみ出した」と判定してしまう
  const measuredText = useRef(children);
  if (measuredText.current !== children) {
    measuredText.current = children;
    widths.current = { box: 0, content: 0 };
  }
  const isOverflowing = truncates && overflow?.text === children;

  const checkOverflow = () => {
    const { box, content } = widths.current;
    // 端数のずれで切り替わらないよう、1px未満のはみ出しは収まったとみなす
    if (box > 0 && content > 0 && content - box >= 1) setOverflow({ contentWidth: content, text: children });
  };
  const handleBoxLayout = (event: LayoutChangeEvent) => {
    widths.current.box = event.nativeEvent.layout.width;
    checkOverflow();
  };
  const handleContentLayout = (event: LayoutChangeEvent) => {
    widths.current.content = event.nativeEvent.layout.width;
    checkOverflow();
  };

  // 普通の文字に切り替えた後も幅を測り、画面の回転などでふりがな付きの幅が入るようになったら戻す
  const handlePlainLayout = (event: LayoutChangeEvent) => {
    if (overflow && event.nativeEvent.layout.width >= overflow.contentWidth) setOverflow(null);
  };

  if (role === "parent" || !hasRuby || isOverflowing) {
    return (
      <Text
        accessibilityRole={accessibilityRole}
        ellipsizeMode={ellipsizeMode}
        numberOfLines={numberOfLines}
        onLayout={isOverflowing ? handlePlainLayout : undefined}
        style={style}
        testID={testID}
      >
        {plain}
      </Text>
    );
  }

  const { containerStyle, textStyle, justifyContent } = splitStyle(style);
  const baseFontSize = typeof textStyle.fontSize === "number" ? textStyle.fontSize : DEFAULT_FONT_SIZE;
  const rubyFontSize = Math.max(MIN_RUBY_FONT_SIZE, Math.round(baseFontSize * RUBY_SCALE));
  const rubyTextStyle: TextStyle = {
    color: textStyle.color,
    fontFamily: textStyle.fontFamily,
    fontSize: rubyFontSize,
    lineHeight: Math.round(rubyFontSize * 1.3),
    textShadowColor: textStyle.textShadowColor,
    textShadowOffset: textStyle.textShadowOffset,
    textShadowRadius: textStyle.textShadowRadius,
  };

  const chunkViews = chunks.map((chunk, chunkIndex) =>
    chunk.kind === "newline" ? (
      <View key={chunkIndex} style={styles.newline} />
    ) : (
      <View key={chunkIndex} style={styles.chunk}>
        {chunk.parts.map((part, partIndex) => (
          <View key={partIndex} style={styles.part}>
            {/* ふりがなの無い所にも同じ高さの空きを置き、行ごとに本文の高さをそろえる */}
            <Text style={[styles.ruby, rubyTextStyle, rubyStyle]}>{part.ruby ?? " "}</Text>
            <Text style={[styles.base, textStyle]}>{part.base}</Text>
          </View>
        ))}
      </View>
    ),
  );

  return (
    <View
      accessible
      accessibilityLabel={plain}
      accessibilityRole={accessibilityRole ?? "text"}
      onLayout={truncates ? handleBoxLayout : undefined}
      style={[
        styles.container,
        (noWrap || truncates) && styles.noWrap,
        truncates && styles.clip,
        justifyContent ? { justifyContent } : null,
        containerStyle,
      ]}
      testID={testID}
    >
      {truncates ? (
        // 中身を縮めずに1行で並べた幅を測り、外側の箱の幅と比べる
        <View onLayout={handleContentLayout} style={styles.measuredRow}>
          {chunkViews}
        </View>
      ) : (
        chunkViews
      )}
    </View>
  );
}

/**
 * Text 向けのスタイルを、本文の文字に渡すものと外側の箱に渡すものに分ける。
 * `textAlign` は、箱の中での並べ方（`justifyContent`）に置き換える。
 */
function splitStyle(style: StyleProp<TextStyle>) {
  const flat = StyleSheet.flatten(style) ?? {};
  const textStyle: TextStyle = {};
  const containerStyle: ViewStyle = {};

  for (const [key, value] of Object.entries(flat)) {
    if (key === "textAlign" || key === "textAlignVertical" || key === "includeFontPadding" || key === "verticalAlign") {
      continue;
    }
    if (TEXT_STYLE_KEYS.has(key)) {
      textStyle[key] = value;
    } else {
      containerStyle[key] = value;
    }
  }

  return { containerStyle, textStyle, justifyContent: JUSTIFY_BY_TEXT_ALIGN[flat.textAlign ?? ""] };
}

// className を style へ変換させる。NativeWind が自動で変換するのは View や Text などの標準部品だけのため
cssInterop(Furigana, { className: "style" });

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
  chunk: {
    flexDirection: "row",
  },
  container: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  newline: {
    width: "100%",
  },
  noWrap: {
    flexWrap: "nowrap",
  },
  clip: {
    overflow: "hidden",
  },
  measuredRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexShrink: 0,
  },
  part: {
    alignItems: "center",
  },
  ruby: {
    includeFontPadding: false,
  },
});
