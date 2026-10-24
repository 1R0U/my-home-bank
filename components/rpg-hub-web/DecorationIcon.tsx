import { StyleSheet, View, type ViewStyle } from "react-native";
import { type DecorationIconKind, getDecorationIconKind } from "../../lib/rpg-hub/decorationMenu";
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
  bed: [
    shape("head", 4, 12, 5, 22, C.woodDark, 1),
    shape("frame", 6, 26, 31, 7, C.wood, 2),
    shape("sheet", 8, 21, 28, 6, C.sheet, 2),
    shape("pillow", 9, 17, 9, 5, C.sheet, 2),
    shape("blanket", 18, 19, 18, 8, C.cloth, 2),
  ],
  floorLamp: [
    circle("glow", 20, 11, 10, C.lampGlow),
    shape("shade", 12, 5, 16, 11, C.shade, 3),
    shape("pole", 19, 16, 2, 17, C.metal),
    shape("foot", 13, 33, 14, 3, C.metal, 1),
  ],
  pottedPlant: [
    circle("leaf1", 20, 14, 9, C.leaf),
    circle("leaf2", 13, 18, 6, C.leafLight),
    circle("leaf3", 27, 17, 6, C.leafDark),
    shape("pot", 12, 23, 16, 13, C.pot, 3),
  ],
  teddyBear: [
    circle("ear1", 13, 8, 4, C.bear),
    circle("ear2", 27, 8, 4, C.bear),
    circle("body", 20, 27, 9, C.bear),
    circle("head", 20, 14, 8, C.bear),
    circle("muzzle", 20, 17, 3.5, C.bearLight),
    circle("eye1", 17, 12, 1.2, C.metal),
    circle("eye2", 23, 12, 1.2, C.metal),
    circle("foot1", 14, 34, 3.5, C.bearLight),
    circle("foot2", 26, 34, 3.5, C.bearLight),
  ],
  toyBox: [
    circle("ball", 13, 12, 5, C.cloth),
    shape("block", 22, 8, 9, 9, C.leafLight, 1),
    shape("lid", 5, 17, 30, 4, C.wood, 1),
    shape("box", 6, 21, 28, 15, C.toyBox, 2),
    shape("stripe", 6, 26, 28, 3, C.flowerYellow),
  ],
  bookshelf: [
    shape("body", 8, 5, 24, 31, C.woodDark, 2),
    shape("shelf1", 10, 14, 20, 2, C.wood),
    shape("shelf2", 10, 24, 20, 2, C.wood),
    shape("book1", 12, 7, 4, 7, C.flowerRed),
    shape("book2", 17, 8, 4, 6, C.cloth),
    shape("book3", 23, 7, 4, 7, C.flowerYellow),
    shape("book4", 12, 17, 4, 7, C.leafLight),
    shape("book5", 18, 18, 4, 6, C.flowerPink),
    shape("book6", 24, 17, 4, 7, C.flowerPurple),
    shape("book7", 14, 27, 4, 7, C.cloth),
    shape("book8", 21, 28, 4, 6, C.flowerRed),
  ],
  bush: [
    shape("base", 5, 22, 30, 14, C.leaf, 7),
    circle("left", 13, 22, 8, C.leafLight),
    circle("right", 26, 21, 9, C.leaf),
  ],
  chair: [
    shape("back", 12, 6, 16, 16, C.wood, 2),
    shape("cushion", 14, 10, 12, 5, C.flowerRed, 2),
    shape("seat", 9, 21, 22, 4, C.wood, 1),
    shape("leg1", 10, 25, 3, 11, C.woodDark),
    shape("leg2", 27, 25, 3, 11, C.woodDark),
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
  // 家の中のソファと同じ色（houseInteriorParts.ts の sofa。Issue #506）
  sofa: [
    shape("back", 7, 11, 26, 12, C.sofa, 3),
    shape("seat", 7, 21, 26, 9, C.sofa, 2),
    shape("cushion1", 9, 19, 10, 5, C.sofaCushion, 2),
    shape("cushion2", 21, 19, 10, 5, C.sofaCushion, 2),
    shape("arm1", 3, 16, 6, 15, C.sofaArm, 2),
    shape("arm2", 31, 16, 6, 15, C.sofaArm, 2),
    shape("pillow", 24, 13, 7, 6, C.flowerYellow, 2),
    shape("leg1", 6, 31, 3, 4, C.woodDark),
    shape("leg2", 31, 31, 3, 4, C.woodDark),
  ],
  rug: [
    shape("edge", 3, 14, 34, 18, C.rugRed, 3),
    shape("inner", 7, 17, 26, 12, C.rugYellow, 2),
    shape("center", 12, 20, 16, 6, C.rugRed, 2),
  ],
  table: [
    shape("book", 20, 11, 9, 4, C.cloth, 1),
    shape("top", 5, 15, 30, 5, C.wood, 2),
    shape("leg1", 8, 20, 3, 16, C.woodDark),
    shape("leg2", 29, 20, 3, 16, C.woodDark),
  ],
  tree: [
    shape("trunk", 17, 23, 6, 13, C.bark, 1),
    circle("top", 20, 16, 11, C.leaf),
    circle("left", 13, 20, 7, C.leafLight),
    circle("right", 27, 19, 7, C.leafDark),
  ],
};

/**
 * 同じ種類の中で見分けるための、装飾ごとの違い。
 *
 * かざるメニューは種類を選んでから中身を選ぶ2段なので、2段目では同じ種類の絵が並ぶ。
 * 全部同じ絵だと見分けられないため、形を置きかえる・部品を足す・縦横に伸ばすで描き分ける。
 * 伸ばすときは、地面に立っているように見えるよう下端をそろえる。
 */
type IconVariant = {
  /** 種類の絵に足す部品 */
  extra?: readonly Shape[];
  /** 種類の絵のかわりに使う部品 */
  replace?: readonly Shape[];
  scaleX?: number;
  scaleY?: number;
};

const ICON_VARIANTS: Record<string, IconVariant> = {
  "decoration-bush-berry": {
    extra: [
      circle("berry1", 13, 26, 2.5, C.berry),
      circle("berry2", 25, 24, 2.5, C.berry),
      circle("berry3", 20, 31, 2.5, C.berry),
    ],
  },
  "decoration-bush-tall": { scaleX: 0.7, scaleY: 1.3 },
  "decoration-bush-wide": { scaleX: 1.2, scaleY: 0.75 },
  "decoration-grass-flower": {
    extra: [circle("flower1", 20, 11, 3.5, C.flowerYellow), circle("flower2", 27, 15, 3.5, C.flowerPink)],
  },
  "decoration-grass-tall": { scaleY: 1.35 },
  "decoration-grass-wide": { scaleX: 1.3, scaleY: 0.75 },
  "decoration-rock-flat": { scaleY: 0.55 },
  "decoration-rock-pile": {
    replace: [
      shape("left", 4, 24, 16, 12, C.rock, 6),
      shape("right", 20, 24, 16, 12, C.rock, 6),
      shape("top", 12, 14, 16, 12, C.rockLight, 6),
    ],
  },
  "decoration-rock-tall": { scaleX: 0.6, scaleY: 1.5 },
  "decoration-tree-pine": {
    replace: [
      shape("trunk", 18, 28, 4, 8, C.bark, 1),
      shape("bottom", 8, 21, 24, 9, C.leafDark, 4),
      shape("middle", 11, 13, 18, 9, C.leaf, 4),
      shape("top", 15, 5, 10, 9, C.leafLight, 4),
    ],
  },
  "decoration-tree-tall": { scaleX: 0.75, scaleY: 1.2 },
  "decoration-tree-young": { scaleX: 0.65, scaleY: 0.65 },
};

/** 絵の地面の高さ（どの絵も、だいたいここに下端が来るように描いている）。 */
const GROUND_Y = 36;

/**
 * 伸ばした絵の下端を、地面の高さにそろえるためのずらし幅。
 * 絵は枠の真ん中を中心に伸び縮みするので、そのままだと浮いたり沈んだりする。
 * @param scaleY - 縦の倍率
 * @returns 縦のずらし幅
 */
function groundOffset(scaleY: number): number {
  return (GROUND_Y - SIZE / 2) * (1 - scaleY);
}

type DecorationIconProps = {
  /** 描く装飾のアセットID */
  assetId: string;
};

/**
 * かざるメニューに出す装飾の絵。
 * @param props - 描く装飾
 * @returns 装飾の絵。種類が分からない装飾なら何も描かない
 */
export default function DecorationIcon({ assetId }: DecorationIconProps) {
  const kind = getDecorationIconKind(assetId);
  if (!kind) return null;

  const variant = ICON_VARIANTS[assetId] ?? {};
  const parts = [...(variant.replace ?? ICON_SHAPES[kind]), ...(variant.extra ?? [])];
  const scaleX = variant.scaleX ?? 1;
  const scaleY = variant.scaleY ?? 1;

  return (
    <View pointerEvents="none" style={styles.frame}>
      <View
        style={[
          styles.frame,
          { transform: [{ translateY: groundOffset(scaleY) }, { scaleX }, { scaleY }] },
        ]}
      >
        {parts.map(({ key, ...part }) => (
          <View key={key} style={[styles.part, part]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: SIZE, width: SIZE },
  part: { position: "absolute" },
});
