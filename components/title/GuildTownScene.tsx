import { StyleSheet, useWindowDimensions, View } from "react-native";

/**
 * タイトル画面の背景に置く、ギルドの建物と町並みの絵（Issue #286）。
 *
 * 画像やSVGライブラリを増やさず、View の四角・丸・三角（border の組み合わせ）だけで描いている。
 * 絵は 360×300 の固定サイズで組み、画面幅に合わせて拡大・縮小する。
 * 表示専用で、タップなどの操作は持たない。
 *
 * 色はホーム画面（我が家タウン）の建物に合わせている（`lib/rpg-hub/buildingParts.ts` /
 * `lib/rpg-hub/season.ts`）。タイトルからログインしてタウンへ入ったとき、別のゲームに
 * 見えないようにするため。
 *
 * **三角・台形を border で描くときの注意。** React Native の `width` / `height` は
 * border を含んだ大きさ（border-box）。台形の屋根を `width: 180` と左右の border 26 で
 * 描くと、全体の幅は 232 ではなく 180 になり、屋根が左へずれる。幅は border を含めた
 * 全体の幅で書くこと（`Trapezoid` がこの計算を持つ）。
 */

/** 絵を組んでいる基準の大きさ */
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 300;

const COLORS = {
  hillFar: "#b5e0a8",
  hillNear: "#9bd18b",
  grass: "#8fcb7f",
  grassEdge: "#7dbb70",
  path: "#efe3c8",
  pathEdge: "#dccaa3",
  // 塔（我が家タウンの銀行と同じ青）
  blueRoof: "#3b7ec0",
  blueRoofShade: "#2563a8",
  towerWall: "#dbeafe",
  towerBand: "#fbbf24",
  // 母屋（我が家タウンのストアと同じ赤い屋根）
  redRoof: "#dc5a3f",
  redRoofShade: "#b8452f",
  wall: "#fff3d6",
  wallLower: "#f6e2bd",
  timber: "#9a4d2e",
  window: "#7dd3fc",
  windowFrame: "#c9a87c",
  shutter: "#ef6a4e",
  door: "#9a4d2e",
  doorKnob: "#d4a754",
  emblem: "#fbbf24",
  emblemRing: "#d4a754",
  flag: "#ef6a4e",
  pole: "#7a5738",
  lantern: "#fff7cc",
  // 両端の家（我が家タウンのクエスト・きろくの建物の色）
  purpleRoof: "#6d3d78",
  purpleWall: "#f3e2c4",
  tealRoof: "#176b67",
  tealWall: "#d8f3ec",
  // 木
  trunk: "#7a5738",
  leafDark: "#2f7a4e",
  leaf: "#37905c",
  leafLight: "#3d9a63",
  flowerPink: "#ef476f",
  flowerYellow: "#ffd166",
} as const;

type TriangleProps = {
  color: string;
  height: number;
  left: number;
  top: number;
  width: number;
};

/**
 * 上向きの三角形（屋根）。
 */
function Triangle({ color, height, left, top, width }: TriangleProps) {
  return (
    <View
      style={{
        borderBottomColor: color,
        borderBottomWidth: height,
        borderLeftColor: "transparent",
        borderLeftWidth: width / 2,
        borderRightColor: "transparent",
        borderRightWidth: width / 2,
        height: 0,
        left,
        position: "absolute",
        top,
        width: 0,
      }}
    />
  );
}

type TrapezoidProps = {
  /** 下辺の幅（絵の上での実際の幅） */
  bottomWidth: number;
  color: string;
  height: number;
  left: number;
  top: number;
  /** 上辺の幅 */
  topWidth: number;
};

/**
 * 上が狭い台形（母屋の屋根）。
 *
 * React Native の `width` は border を含むため、`width` には下辺の幅をそのまま渡す。
 * 上辺の幅は `width - 左右のborder` になる。
 */
function Trapezoid({ bottomWidth, color, height, left, top, topWidth }: TrapezoidProps) {
  const slant = (bottomWidth - topWidth) / 2;
  return (
    <View
      style={{
        borderBottomColor: color,
        borderBottomWidth: height,
        borderLeftColor: "transparent",
        borderLeftWidth: slant,
        borderRightColor: "transparent",
        borderRightWidth: slant,
        height: 0,
        left,
        position: "absolute",
        top,
        width: bottomWidth,
      }}
    />
  );
}

type WindowProps = { left: number; top: number; shutters?: boolean };

/**
 * 十字の桟が入った窓。`shutters` を付けると左右に雨戸が付く。
 */
function GuildWindow({ left, top, shutters = false }: WindowProps) {
  return (
    <View style={[styles.window, { left, top }]}>
      <View style={styles.windowBarVertical} />
      <View style={styles.windowBarHorizontal} />
      {shutters ? (
        <>
          <View style={[styles.shutter, { left: -12 }]} />
          <View style={[styles.shutter, { right: -12 }]} />
        </>
      ) : null}
    </View>
  );
}

type SideHouseProps = { left: number; roof: string; top: number; wall: string };

/**
 * 画面の両端に少しだけ見える、奥の家。
 */
function SideHouse({ left, roof, top, wall }: SideHouseProps) {
  return (
    <View style={{ height: 140, left, position: "absolute", top, width: 90 }}>
      <Triangle color={roof} height={46} left={0} top={0} width={90} />
      <View style={[styles.sideHouseWall, { backgroundColor: wall }]}>
        <View style={[styles.sideHouseWindow, { left: 14 }]} />
        <View style={[styles.sideHouseWindow, { left: 48 }]} />
      </View>
    </View>
  );
}

/**
 * まるい葉の木。`left` / `top` は幹の根元ではなく、木全体の左上。
 */
function Tree({ left, top }: { left: number; top: number }) {
  return (
    <View style={{ height: 76, left, position: "absolute", top, width: 56 }}>
      <View style={styles.trunk} />
      <View style={[styles.leaf, { backgroundColor: COLORS.leafDark, height: 48, left: 0, top: 14, width: 48 }]} />
      <View style={[styles.leaf, { backgroundColor: COLORS.leaf, height: 42, left: 14, top: 4, width: 42 }]} />
      <View style={[styles.leaf, { backgroundColor: COLORS.leafLight, height: 30, left: 10, top: 0, width: 30 }]} />
    </View>
  );
}

/**
 * ギルドの建物と町並みを描く。親の下端に合わせて置く想定。
 */
export function GuildTownScene() {
  const { width } = useWindowDimensions();
  // 横幅いっぱいに広げる。極端に大きい画面では広げすぎない
  const scale = Math.min(width / DESIGN_WIDTH, 1.6);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ height: DESIGN_HEIGHT * scale, overflow: "visible", pointerEvents: "none", width }}
    >
      <View
        style={[
          styles.canvas,
          {
            left: (width - DESIGN_WIDTH) / 2,
            top: (DESIGN_HEIGHT * scale - DESIGN_HEIGHT) / 2,
            transform: [{ scale }],
          },
        ]}
      >
        {/* 奥の丘 */}
        <View style={[styles.hill, { backgroundColor: COLORS.hillFar, left: -160, top: 150, width: 380 }]} />
        <View style={[styles.hill, { backgroundColor: COLORS.hillNear, left: 150, top: 175, width: 400 }]} />

        {/* 両端の家 */}
        <SideHouse left={-52} roof={COLORS.purpleRoof} top={128} wall={COLORS.purpleWall} />
        <SideHouse left={322} roof={COLORS.tealRoof} top={120} wall={COLORS.tealWall} />

        {/* 広場（草地と、入口へ続く道） */}
        <View style={styles.plaza} />
        <View style={styles.path} />

        {/* ===== 塔 ===== */}
        <View style={styles.flagPole} />
        <View style={styles.flag} />
        <Triangle color={COLORS.blueRoof} height={86} left={22} top={52} width={96} />
        <View style={styles.towerRoofShade} />
        <View style={styles.tower}>
          <View style={[styles.towerBand, { top: 0 }]} />
          <View style={styles.towerWindow} />
          <View style={[styles.towerWindow, { top: 88 }]} />
        </View>

        {/* ===== 母屋 ===== */}
        {/* 屋根（上が狭い台形）。壁（112〜308）の中央 210 に合わせる */}
        <Trapezoid
          bottomWidth={228}
          color={COLORS.redRoof}
          height={64}
          left={96}
          top={108}
          topWidth={176}
        />
        <View style={styles.mainRoofEave} />
        {/* 屋根の上の紋章 */}
        <View style={styles.emblemBase} />
        <View style={styles.emblem} />

        {/* 2階（漆喰と木組み） */}
        <View style={styles.upperFloor}>
          <View style={[styles.timberPost, { left: 60 }]} />
          <View style={[styles.timberPost, { left: 124 }]} />
          <GuildWindow left={24} top={16} shutters />
          <GuildWindow left={84} top={16} />
          <GuildWindow left={144} top={16} shutters />
        </View>
        <View style={styles.floorBeam} />

        {/* 1階（入口） */}
        <View style={styles.lowerFloor}>
          <View style={[styles.lowerWindow, { left: 18 }]} />
          <View style={[styles.lowerWindow, { right: 18 }]} />
          <View style={styles.doorArch}>
            <View style={styles.doorKnob} />
          </View>
          <View style={[styles.lantern, { left: 64 }]} />
          <View style={[styles.lantern, { right: 64 }]} />
        </View>

        {/* 木と花 */}
        <Tree left={-4} top={206} />
        <Tree left={312} top={204} />
        <View style={[styles.flower, { backgroundColor: COLORS.flowerPink, left: 128 }]} />
        <View style={[styles.flower, { backgroundColor: COLORS.flowerYellow, left: 142 }]} />
        <View style={[styles.flower, { backgroundColor: COLORS.flowerYellow, left: 270 }]} />
        <View style={[styles.flower, { backgroundColor: COLORS.flowerPink, left: 284 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: DESIGN_HEIGHT,
    position: "absolute",
    width: DESIGN_WIDTH,
  },
  hill: {
    borderTopLeftRadius: 200,
    borderTopRightRadius: 200,
    height: 160,
    position: "absolute",
  },
  plaza: {
    backgroundColor: COLORS.grass,
    borderTopColor: COLORS.grassEdge,
    borderTopWidth: 3,
    height: 30,
    left: -120,
    position: "absolute",
    top: 270,
    width: DESIGN_WIDTH + 240,
  },
  path: {
    backgroundColor: COLORS.path,
    borderColor: COLORS.pathEdge,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    height: 28,
    left: 184,
    position: "absolute",
    top: 272,
    width: 52,
  },
  sideHouseWall: {
    height: 96,
    left: 6,
    position: "absolute",
    top: 46,
    width: 78,
  },
  sideHouseWindow: {
    backgroundColor: COLORS.window,
    borderColor: COLORS.windowFrame,
    borderWidth: 2,
    height: 20,
    position: "absolute",
    top: 22,
    width: 16,
  },
  flagPole: {
    backgroundColor: COLORS.pole,
    height: 60,
    left: 69,
    position: "absolute",
    top: 0,
    width: 2,
  },
  flag: {
    backgroundColor: COLORS.flag,
    borderBottomRightRadius: 6,
    borderTopRightRadius: 6,
    height: 14,
    left: 71,
    position: "absolute",
    top: 2,
    width: 28,
  },
  towerRoofShade: {
    // 円すい屋根の右半分を少し暗くして立体感を出す
    borderBottomColor: COLORS.blueRoofShade,
    borderBottomWidth: 86,
    borderRightColor: "transparent",
    borderRightWidth: 48,
    height: 0,
    left: 70,
    opacity: 0.45,
    position: "absolute",
    top: 52,
    width: 0,
  },
  tower: {
    backgroundColor: COLORS.towerWall,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 136,
    left: 34,
    overflow: "hidden",
    position: "absolute",
    top: 138,
    width: 72,
  },
  towerBand: {
    backgroundColor: COLORS.towerBand,
    height: 8,
    left: 0,
    position: "absolute",
    right: 0,
  },
  towerWindow: {
    backgroundColor: COLORS.window,
    borderColor: COLORS.windowFrame,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 2,
    height: 22,
    left: 28,
    position: "absolute",
    top: 30,
    width: 16,
  },
  mainRoofEave: {
    backgroundColor: COLORS.redRoofShade,
    borderRadius: 3,
    height: 6,
    left: 92,
    position: "absolute",
    top: 170,
    width: 236,
  },
  emblemBase: {
    backgroundColor: COLORS.shutter,
    height: 30,
    left: 193,
    position: "absolute",
    top: 118,
    width: 34,
  },
  emblem: {
    backgroundColor: COLORS.emblem,
    borderColor: COLORS.emblemRing,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    left: 198,
    position: "absolute",
    top: 110,
    width: 24,
  },
  upperFloor: {
    backgroundColor: COLORS.wall,
    borderColor: COLORS.timber,
    borderWidth: 4,
    height: 60,
    left: 112,
    overflow: "hidden",
    position: "absolute",
    top: 176,
    width: 196,
  },
  timberPost: {
    backgroundColor: COLORS.timber,
    height: 60,
    position: "absolute",
    top: 0,
    width: 4,
  },
  window: {
    backgroundColor: COLORS.window,
    borderColor: COLORS.windowFrame,
    borderWidth: 2,
    height: 26,
    position: "absolute",
    width: 20,
  },
  windowBarVertical: {
    backgroundColor: COLORS.windowFrame,
    height: 22,
    left: 7,
    position: "absolute",
    width: 2,
  },
  windowBarHorizontal: {
    backgroundColor: COLORS.windowFrame,
    height: 2,
    position: "absolute",
    top: 10,
    width: 16,
  },
  shutter: {
    backgroundColor: COLORS.shutter,
    height: 26,
    position: "absolute",
    top: -2,
    width: 10,
  },
  floorBeam: {
    backgroundColor: COLORS.timber,
    height: 6,
    left: 108,
    position: "absolute",
    top: 234,
    width: 204,
  },
  lowerFloor: {
    backgroundColor: COLORS.wallLower,
    height: 34,
    left: 112,
    overflow: "hidden",
    position: "absolute",
    top: 240,
    width: 196,
  },
  lowerWindow: {
    backgroundColor: COLORS.window,
    borderColor: COLORS.windowFrame,
    borderWidth: 2,
    height: 20,
    position: "absolute",
    top: 6,
    width: 26,
  },
  doorArch: {
    backgroundColor: COLORS.door,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    bottom: 0,
    height: 30,
    left: 76,
    position: "absolute",
    width: 44,
  },
  doorKnob: {
    backgroundColor: COLORS.doorKnob,
    borderRadius: 3,
    height: 6,
    position: "absolute",
    right: 8,
    top: 16,
    width: 6,
  },
  lantern: {
    backgroundColor: COLORS.lantern,
    borderRadius: 3,
    height: 6,
    position: "absolute",
    shadowColor: COLORS.lantern,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    top: 4,
    width: 6,
  },
  trunk: {
    backgroundColor: COLORS.trunk,
    borderRadius: 3,
    bottom: 0,
    height: 26,
    left: 22,
    position: "absolute",
    width: 10,
  },
  leaf: {
    borderRadius: 30,
    position: "absolute",
  },
  flower: {
    borderColor: "#ffffff",
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    top: 276,
    width: 10,
  },
});
