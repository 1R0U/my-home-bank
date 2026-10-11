import { StyleSheet, View, type ViewStyle } from "react-native";
import { type DecorationIconKind } from "../../lib/rpg-hub/decorationIcon";
import { DECORATION_ICON_COLORS as C } from "./decorationStyles";

/** 絵を描く枠の大きさ。部品の位置はこの枠の中の座標で書く。 */
const SIZE = 40;

type Shape = ViewStyle & { key: string };

/**
 * 丸・四角を置くための短い書き方。
 * @param key - React の key
 * @param left - 左端
 * @param top - 上端
 * @param width - 幅
 * @param height - 高さ
 * @param color - 色
 * @param radius - 角の丸み。省くと四角
 * @returns 部品のスタイル
 */
function shape(
  key: string,
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  radius = 0,
): Shape {
  return { backgroundColor: color, borderRadius: radius, height, key, left, top, width };
}

/** 丸。中心と半径で置く。 */
function circle(key: string, cx: number, cy: number, r: number, color: string): Shape {
  return shape(key, cx - r, cy - r, r * 2, r * 2, color, r);
}

/**
 * 種類ごとの絵の部品。後ろに書いたものほど手前に重なる。
 *
 * SVG の部品は入っていないので、丸と角丸の四角だけで描いている。
 */
const ICON_SHAPES: Record<DecorationIconKind, readonly Shape[]> = {
  bush: [
    shape("base", 5, 22, 30, 14, C.leaf, 7),
    circle("left", 13, 22, 8, C.leafLight),
    circle("right", 26, 21, 9, C.leaf),
    circle("berry1", 13, 26, 2.5, C.berry),
    circle("berry2", 25, 24, 2.5, C.berry),
    circle("berry3", 20, 31, 2.5, C.berry),
  ],
  flowerbed: [
    shape("stem1", 11, 16, 2, 10, C.leaf),
    shape("stem2", 19, 13, 2, 13, C.leaf),
    shape("stem3", 27, 16, 2, 10, C.leaf),
    circle("flower1", 12, 15, 4, C.flowerPink),
    circle("flower2", 20, 12, 4, C.flowerYellow),
    circle("flower3", 28, 15, 4, C.flowerPurple),
    shape("box", 5, 25, 30, 11, C.soil, 3),
  ],
  grass: [
    shape("blade1", 11, 18, 4, 18, C.leaf, 2),
    shape("blade2", 18, 12, 4, 24, C.leafLight, 2),
    shape("blade3", 25, 16, 4, 20, C.leafDark, 2),
    circle("flower1", 20, 11, 3, C.flowerYellow),
    circle("flower2", 27, 15, 3, C.flowerPink),
  ],
  hanger: [
    shape("pole1", 9, 8, 3, 28, C.metal, 1),
    shape("pole2", 28, 8, 3, 28, C.metal, 1),
    shape("bar", 9, 8, 22, 3, C.metal, 1),
    shape("cloth1", 13, 11, 7, 15, C.cloth, 2),
    shape("cloth2", 21, 11, 6, 12, C.flowerRed, 2),
    shape("foot", 5, 34, 30, 3, C.metal, 1),
  ],
  lamp: [
    circle("glow", 20, 12, 10, C.lampGlow),
    shape("post", 18.5, 15, 3, 19, C.metal),
    shape("foot", 14, 33, 12, 3, C.metal, 1),
    shape("light", 15, 9, 10, 8, C.lampLight, 2),
    shape("roof", 13, 6, 14, 4, C.metal, 2),
  ],
  rock: [
    shape("big", 6, 17, 28, 18, C.rock, 9),
    shape("shine", 11, 19, 12, 7, C.rockLight, 4),
  ],
  tree: [
    shape("trunk", 17, 23, 6, 13, C.bark, 1),
    circle("top", 20, 16, 11, C.leaf),
    circle("left", 13, 20, 7, C.leafLight),
    circle("right", 27, 19, 7, C.leafDark),
  ],
};

type DecorationIconProps = {
  kind: DecorationIconKind;
};

/**
 * かざるメニューに出す装飾の絵。
 * @param props - 絵の種類
 * @returns 装飾の絵
 */
export default function DecorationIcon({ kind }: DecorationIconProps) {
  return (
    <View pointerEvents="none" style={styles.frame}>
      {ICON_SHAPES[kind].map(({ key, ...part }) => (
        <View key={key} style={[styles.part, part]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: SIZE, width: SIZE },
  part: { position: "absolute" },
});
