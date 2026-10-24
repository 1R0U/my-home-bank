import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { HouseFinish } from "../../lib/rpg-hub/houseFinishes";
import { CHILD_THEME } from "../childTheme";
import { decorationStyles } from "./decorationStyles";

type HouseFinishShelfProps = {
  /** 選べる壁紙・床板（家に付いている1つと、持っているもの） */
  finishes: readonly HouseFinish<string>[];
  /** 保存の処理中など、いまは選べない */
  disabled: boolean;
  onSelect: (id: string) => void;
  /** 今の壁紙・床板 */
  selectedId: string;
};

/**
 * かざるの「かべ」「ゆか」のタブの棚（Issue #480）。持っている壁紙・床板を並べ、タップするとその場で替わる。
 * @param props - 並べる壁紙・床板と、選んだときの処理
 * @returns 棚
 */
export default function HouseFinishShelf(props: HouseFinishShelfProps) {
  return (
    <ScrollView
      contentContainerStyle={decorationStyles.shelfContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={decorationStyles.shelf}
    >
      {props.finishes.map((finish) => {
        const selected = finish.id === props.selectedId;
        return (
          <Pressable
            accessibilityLabel={selected ? `${finish.label}　つかっている` : `${finish.label}にかえる`}
            accessibilityRole="button"
            accessibilityState={{ disabled: props.disabled, selected }}
            disabled={props.disabled}
            key={finish.id}
            onPress={() => props.onSelect(finish.id)}
            style={decorationStyles.slot}
          >
            <View style={[decorationStyles.slotPicture, selected && styles.selectedPicture]}>
              <FinishSwatch finish={finish} />
              {selected && (
                <View style={decorationStyles.countBadge}>
                  <Text style={decorationStyles.countBadgeText}>✓</Text>
                </View>
              )}
            </View>
            <Text numberOfLines={2} style={decorationStyles.slotLabel}>
              {finish.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 見本の一辺 */
const SWATCH = 40;
/** 柄の線の太さ */
const LINE = 2;

/**
 * 壁紙・床板の見本の絵。3Dと同じ地の色と柄（houseFinishes.ts）で描く。
 * @param props - 壁紙・床板
 * @returns 見本
 */
function FinishSwatch(props: { finish: HouseFinish<string> }) {
  const look = props.finish.look;
  const line = (key: string, style: ViewStyle) => (
    <View key={key} style={[styles.line, { backgroundColor: look.line }, style]} />
  );
  const lines: ReactElement[] = [];
  const third = SWATCH / 3;
  if (look.pattern === "planks" || look.pattern === "tiles") {
    [1, 2].forEach((index) => lines.push(line(`h${index}`, { height: LINE, left: 0, right: 0, top: third * index })));
  }
  if (look.pattern === "tiles" || look.pattern === "boards") {
    [1, 2].forEach((index) => lines.push(line(`v${index}`, { bottom: 0, left: third * index, top: 0, width: LINE })));
  }
  if (look.pattern === "bricks") {
    const course = SWATCH / 4;
    [1, 2, 3].forEach((index) => lines.push(line(`h${index}`, { height: LINE, left: 0, right: 0, top: course * index })));
    // 縦の目地は段ごとにずらす
    [0, 1, 2, 3].forEach((index) =>
      lines.push(line(`v${index}`, { height: course, left: index % 2 === 0 ? SWATCH / 2 : SWATCH / 4, top: course * index, width: LINE })),
    );
  }
  if (look.pattern === "dots") {
    [
      { left: 7, top: 7 },
      { left: 25, top: 12 },
      { left: 12, top: 25 },
      { left: 28, top: 29 },
    ].forEach((point, index) => lines.push(line(`d${index}`, { ...point, height: 6, transform: [{ rotate: "45deg" }], width: 6 })));
  }
  return <View style={[styles.swatch, { backgroundColor: look.base }]}>{lines}</View>;
}

const styles = StyleSheet.create({
  line: { position: "absolute" },
  selectedPicture: { borderColor: CHILD_THEME.gold, borderWidth: 3 },
  swatch: { borderRadius: 6, height: SWATCH, overflow: "hidden", width: SWATCH },
});
