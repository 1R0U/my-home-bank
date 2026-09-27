import { StyleSheet, useWindowDimensions, View } from "react-native";

/**
 * タイトル画面の背景に置く、ギルドの建物と町並みの絵（Issue #286）。
 *
 * 画像やSVGライブラリを増やさず、View の四角・丸・三角（border の組み合わせ）だけで描いている。
 * 絵は 360×300 の固定サイズで組み、画面幅に合わせて拡大・縮小する。
 * 表示専用で、タップなどの操作は持たない。
 */

/** 絵を組んでいる基準の大きさ */
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 300;

const COLORS = {
  mountainFar: "#b9bcc0",
  mountainNear: "#a6a9ab",
  slateRoof: "#56687f",
  slateRoofShade: "#465669",
  stone: "#a7a39c",
  stoneDark: "#8b867f",
  stoneLight: "#c0bbb2",
  redRoof: "#b9544a",
  redRoofShade: "#9b433b",
  plaster: "#efe6d5",
  timber: "#6e4127",
  window: "#e9cfa1",
  windowFrame: "#7b4a2b",
  shutter: "#c0514a",
  door: "#2c211b",
  flag: "#d0584c",
  pole: "#6c5a4a",
  emblem: "#c9c3aa",
  emblemRing: "#a5402f",
  lantern: "#fff6d8",
  plaza: "#8e8a80",
  plazaEdge: "#77736a",
  crate: "#5b3d27",
} as const;

type TriangleProps = {
  color: string;
  height: number;
  left: number;
  top: number;
  width: number;
};

/**
 * 上向きの三角形（屋根・山）。
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

type WindowProps = { left: number; top: number; shutters?: boolean };

/**
 * 十字の桟が入った窓。`shutters` を付けると左右に赤い雨戸が付く。
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

/**
 * 画面の両端に少しだけ見える、奥の家。
 */
function SideHouse({ left, top }: { left: number; top: number }) {
  return (
    <View style={{ height: 140, left, position: "absolute", top, width: 90 }}>
      <Triangle color={COLORS.slateRoof} height={46} left={0} top={0} width={90} />
      <View style={styles.sideHouseWall}>
        <View style={[styles.sideHouseWindow, { left: 14 }]} />
        <View style={[styles.sideHouseWindow, { left: 48 }]} />
      </View>
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
        {/* 遠くの山 */}
        <Triangle color={COLORS.mountainFar} height={120} left={-120} top={60} width={360} />
        <Triangle color={COLORS.mountainNear} height={90} left={170} top={90} width={320} />

        {/* 両端の家 */}
        <SideHouse left={-52} top={128} />
        <SideHouse left={322} top={120} />

        {/* 広場 */}
        <View style={styles.plaza} />

        {/* ===== 塔 ===== */}
        <View style={styles.flagPole} />
        <View style={styles.flag} />
        <Triangle color={COLORS.slateRoof} height={86} left={22} top={52} width={96} />
        <View style={styles.towerRoofShade} />
        <View style={styles.tower}>
          <View style={[styles.stoneBlock, { left: 8, top: 20 }]} />
          <View style={[styles.stoneBlock, { left: 34, top: 44 }]} />
          <View style={[styles.stoneBlock, { left: 14, top: 76 }]} />
          <View style={[styles.stoneBlock, { left: 40, top: 104 }]} />
          <View style={[styles.stoneBlock, { left: 10, top: 132 }]} />
          <View style={styles.towerWindow} />
        </View>

        {/* ===== 母屋 ===== */}
        {/* 屋根（上が狭い台形） */}
        <View style={styles.mainRoof} />
        <View style={styles.mainRoofEave} />
        {/* 屋根の上の紋章 */}
        <View style={styles.emblemBase} />
        <View style={styles.emblem} />

        {/* 2階（漆喰と木組み） */}
        <View style={styles.upperFloor}>
          <View style={[styles.timberPost, { left: 60 }]} />
          <View style={[styles.timberPost, { left: 120 }]} />
          <View style={[styles.timberBrace, { left: 18, transform: [{ rotate: "35deg" }] }]} />
          <View style={[styles.timberBrace, { left: 150, transform: [{ rotate: "-35deg" }] }]} />
          <GuildWindow left={24} top={16} shutters />
          <GuildWindow left={84} top={16} />
          <GuildWindow left={144} top={16} shutters />
        </View>
        <View style={styles.floorBeam} />

        {/* 1階（石積みと入口） */}
        <View style={styles.lowerFloor}>
          <View style={[styles.stoneBlock, { left: 10, top: 10 }]} />
          <View style={[styles.stoneBlock, { left: 150, top: 14 }]} />
          <View style={[styles.stoneBlock, { left: 40, top: 52 }]} />
          <View style={[styles.stoneBlock, { left: 128, top: 56 }]} />
          <View style={[styles.lowerWindow, { left: 18 }]} />
          <View style={[styles.lowerWindow, { right: 18 }]} />
          <View style={styles.doorArch} />
          <View style={[styles.lantern, { left: 58 }]} />
          <View style={[styles.lantern, { right: 58 }]} />
        </View>

        {/* 入口わきの木箱 */}
        <View style={[styles.crate, { left: 112 }]} />
        <View style={[styles.crate, { left: 256 }]} />
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
  plaza: {
    backgroundColor: COLORS.plaza,
    borderTopColor: COLORS.plazaEdge,
    borderTopWidth: 3,
    height: 30,
    left: -120,
    position: "absolute",
    top: 270,
    width: DESIGN_WIDTH + 240,
  },
  sideHouseWall: {
    backgroundColor: COLORS.plaster,
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
    height: 14,
    left: 71,
    position: "absolute",
    top: 2,
    width: 28,
  },
  towerRoofShade: {
    // 円すい屋根の右半分を少し暗くして立体感を出す
    borderBottomColor: COLORS.slateRoofShade,
    borderBottomWidth: 86,
    borderRightColor: "transparent",
    borderRightWidth: 48,
    height: 0,
    left: 70,
    opacity: 0.55,
    position: "absolute",
    top: 52,
    width: 0,
  },
  tower: {
    backgroundColor: COLORS.stone,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 136,
    left: 34,
    overflow: "hidden",
    position: "absolute",
    top: 138,
    width: 72,
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
    top: 44,
    width: 16,
  },
  stoneBlock: {
    backgroundColor: COLORS.stoneDark,
    borderRadius: 2,
    height: 9,
    opacity: 0.55,
    position: "absolute",
    width: 18,
  },
  mainRoof: {
    borderBottomColor: COLORS.redRoof,
    borderBottomWidth: 64,
    borderLeftColor: "transparent",
    borderLeftWidth: 26,
    borderRightColor: "transparent",
    borderRightWidth: 26,
    height: 0,
    left: 92,
    position: "absolute",
    top: 108,
    width: 180,
  },
  mainRoofEave: {
    backgroundColor: COLORS.redRoofShade,
    height: 6,
    left: 90,
    position: "absolute",
    top: 170,
    width: 236,
  },
  emblemBase: {
    backgroundColor: COLORS.shutter,
    height: 30,
    left: 191,
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
    left: 196,
    position: "absolute",
    top: 110,
    width: 24,
  },
  upperFloor: {
    backgroundColor: COLORS.plaster,
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
  timberBrace: {
    backgroundColor: COLORS.timber,
    height: 64,
    position: "absolute",
    top: -4,
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
    backgroundColor: COLORS.stoneLight,
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
  crate: {
    backgroundColor: COLORS.crate,
    borderColor: "#402a1a",
    borderWidth: 2,
    height: 14,
    position: "absolute",
    top: 262,
    width: 18,
  },
});
