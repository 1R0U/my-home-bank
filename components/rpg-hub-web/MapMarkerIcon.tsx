import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import type { MapRouteId } from "../../types/map";
import { CHILD_THEME } from "../childTheme";

/**
 * 我が家タウンのマップに置く目印の絵（Issue #413）。
 *
 * 以前は絵文字（OSで絵柄が変わる）、次に Ionicons（アプリのUI用の記号で、木と羊皮紙の
 * 世界観に合わない）を使っていた。どちらもやめ、このアプリ専用の絵を SVG で描く。
 *
 * - **形はすべて共通の「メダル」。** 木の縁取り（`CHILD_THEME.darkWood`）の中に羊皮紙
 *   （`CHILD_THEME.parchment`）を敷き、金の細い輪を入れる。宝の地図に押した印のイメージ。
 * - **中の絵はインク（濃い茶）の線で描き、建物ごとの色を1色だけ差す。** 差し色は
 *   3Dの町の建物の屋根の色（`lib/rpg-hub/buildingParts.ts`）に合わせ、マップと町の
 *   建物を色で結びつける（銀行=青、ストア=赤、タスク=紫、きろく=緑青、家=桃紫）。
 * - 絵は 32×32 の座標で描き、`size` に合わせて拡大・縮小する（ベクターなのでぼやけない）。
 */

/** マップの目印の種類。建物（route）に加えて、置いた飾り。NPCは地図に出さない（Issue #409）。 */
export type MapMarkerKind = MapRouteId | "decoration";

/** インク（線）の色。木の文字と同じ濃い茶。 */
const INK = CHILD_THEME.darkWood;

/** 絵の配色。建物の差し色は buildingParts.ts の屋根の色と同じ。 */
const COLORS = {
  bankRoof: "#3b7ec0",
  boardWood: "#a0673a",
  coin: "#f2c94c",
  coinShade: "#d4a754",
  historyRoof: "#176b67",
  houseRoof: "#b565a7",
  houseWall: "#fff3d6",
  mirror: "#bfe3f5",
  stairs: "#9a6b45",
  storeRoof: "#dc5a3f",
  tasksRoof: "#6d3d78",
  wardrobeFrame: "#9a4d2e",
} as const;

const STROKE = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.4 } as const;

/** 階段（上り・下りで矢印の向きだけ変える）。 */
function StairsGlyph({ up }: { up: boolean }) {
  return (
    <G>
      <Path d="M9 23 H13 V19 H17 V15 H21 V11 H23 V23 Z" fill={COLORS.stairs} {...STROKE} />
      {up ? (
        <Path d="M10 15 L10 9 M7.5 11.5 L10 9 L12.5 11.5" fill="none" {...STROKE} strokeWidth={1.8} />
      ) : (
        <Path d="M10 8 L10 14 M7.5 11.5 L10 14 L12.5 11.5" fill="none" {...STROKE} strokeWidth={1.8} />
      )}
    </G>
  );
}

/** 種類ごとの中の絵。`Record<MapMarkerKind, …>` にして、ルートを増やしたら型エラーで気づけるようにする。 */
const GLYPHS: Record<MapMarkerKind, () => React.ReactElement> = {
  // 銀行: 積んだ金貨と、銀行の青い屋根の色の台
  bank: () => (
    <G>
      <Rect fill={COLORS.bankRoof} height={3} rx={1} width={16} x={8} y={21} {...STROKE} />
      <Ellipse cx={13} cy={18.5} fill={COLORS.coinShade} rx={4.5} ry={2} {...STROKE} />
      <Ellipse cx={13} cy={16} fill={COLORS.coin} rx={4.5} ry={2} {...STROKE} />
      <Ellipse cx={19.5} cy={18.5} fill={COLORS.coinShade} rx={4.5} ry={2} {...STROKE} />
      <Ellipse cx={19.5} cy={16} fill={COLORS.coinShade} rx={4.5} ry={2} {...STROKE} />
      <Ellipse cx={19.5} cy={13.5} fill={COLORS.coin} rx={4.5} ry={2} {...STROKE} />
      <Ellipse cx={16} cy={11} fill={COLORS.coin} rx={4.5} ry={2} {...STROKE} />
    </G>
  ),
  // 掲示板: 2本の脚の木の板に、紙を1枚留めたもの
  board: () => (
    <G>
      <Line x1={11} x2={11} y1={19} y2={25} {...STROKE} strokeWidth={2} />
      <Line x1={21} x2={21} y1={19} y2={25} {...STROKE} strokeWidth={2} />
      <Rect fill={COLORS.boardWood} height={11} rx={1.5} width={17} x={7.5} y={8.5} {...STROKE} />
      <Rect fill={CHILD_THEME.parchment} height={7} width={6} x={10} y={10.5} {...STROKE} strokeWidth={1} />
      <Rect fill={CHILD_THEME.parchment} height={5} width={5} x={17.5} y={11.5} {...STROKE} strokeWidth={1} />
      <Circle cx={13} cy={10.8} fill={COLORS.storeRoof} r={0.9} />
    </G>
  ),
  decoration: () => (
    <Path
      d="M16 6.5 L18.2 13.8 L25.5 16 L18.2 18.2 L16 25.5 L13.8 18.2 L6.5 16 L13.8 13.8 Z"
      fill={COLORS.coin}
      {...STROKE}
    />
  ),
  downstairs: () => <StairsGlyph up={false} />,
  // きろく: 開いた本（きろくの建物の緑青を表紙に）
  history: () => (
    <G>
      <Path d="M6.5 11 L16 12.5 L25.5 11 V23 L16 24.5 L6.5 23 Z" fill={COLORS.historyRoof} {...STROKE} />
      <Path d="M8 10 Q12 9 16 11 V22.5 Q12 20.5 8 21.5 Z" fill={CHILD_THEME.parchment} {...STROKE} />
      <Path d="M24 10 Q20 9 16 11 V22.5 Q20 20.5 24 21.5 Z" fill={CHILD_THEME.parchment} {...STROKE} />
      <Path d="M10 13.5 Q12 13 14 14 M10 16.5 Q12 16 14 17 M18 14 Q20 13 22 13.5 M18 17 Q20 16 22 16.5" fill="none" {...STROKE} strokeWidth={0.9} />
    </G>
  ),
  // 自分の家: 三角屋根の小さな家（家の屋根の桃紫）
  house: () => (
    <G>
      <Rect fill={COLORS.houseWall} height={9} width={13} x={9.5} y={15} {...STROKE} />
      <Path d="M7 16 L16 8 L25 16 Z" fill={COLORS.houseRoof} {...STROKE} />
      <Rect fill={COLORS.wardrobeFrame} height={5} rx={1} width={3.6} x={14.2} y={19} {...STROKE} strokeWidth={1} />
    </G>
  ),
  // ストア: しま模様の日よけの屋台（ストアの赤い屋根）
  store: () => (
    <G>
      <Rect fill={COLORS.houseWall} height={8} width={14} x={9} y={16} {...STROKE} />
      <Path d="M7.5 15.5 L9.5 9 H22.5 L24.5 15.5 Z" fill={CHILD_THEME.parchment} {...STROKE} />
      <Path d="M11.6 9 L10.3 15.5 H13.6 L14.4 9 Z M17.6 9 L18.4 15.5 H21.7 L20.4 9 Z" fill={COLORS.storeRoof} />
      <Path d="M7.5 15.5 L9.5 9 H22.5 L24.5 15.5 Z" fill="none" {...STROKE} />
      <Rect fill={COLORS.coin} height={3} rx={1} width={6} x={13} y={19} {...STROKE} strokeWidth={1} />
    </G>
  ),
  // タスク: 巻物（クエストの依頼書。タスクの建物の紫の紐）
  tasks: () => (
    <G>
      <Rect fill={CHILD_THEME.parchment} height={13} width={12} x={10} y={9.5} {...STROKE} />
      <Rect fill={COLORS.coinShade} height={3} rx={1.5} width={16} x={8} y={7.5} {...STROKE} />
      <Rect fill={COLORS.coinShade} height={3} rx={1.5} width={16} x={8} y={21.5} {...STROKE} />
      <Path d="M12.5 13 H19.5 M12.5 15.8 H19.5 M12.5 18.6 H17" fill="none" {...STROKE} strokeWidth={1} />
      <Path d="M16 24.5 L14.5 27 M16 24.5 L17.5 27" fill="none" stroke={COLORS.tasksRoof} strokeLinecap="round" strokeWidth={1.6} />
    </G>
  ),
  upstairs: () => <StairsGlyph up />,
  // 姿見: 木の枠の楕円の鏡
  wardrobe: () => (
    <G>
      <Path d="M12 25 L14 21.5 M20 25 L18 21.5" fill="none" {...STROKE} strokeWidth={1.6} />
      <Ellipse cx={16} cy={14.5} fill={COLORS.wardrobeFrame} rx={6} ry={8} {...STROKE} />
      <Ellipse cx={16} cy={14.5} fill={COLORS.mirror} rx={4} ry={6} {...STROKE} strokeWidth={1} />
      <Path d="M14 11 L15.5 9.8 M14 13.5 L17 11" fill="none" stroke={CHILD_THEME.parchment} strokeLinecap="round" strokeWidth={1} />
    </G>
  ),
};

type MapMarkerIconProps = { kind: MapMarkerKind; size: number };

/**
 * マップの目印1個（メダルと中の絵）。
 *
 * 置いた飾り（`decoration`）だけはメダルを付けず、金の星だけを描く。数が多く、
 * 建物やNPCより目立たせないため。
 */
export default function MapMarkerIcon({ kind, size }: MapMarkerIconProps) {
  const Glyph = GLYPHS[kind];
  return (
    <Svg height={size} viewBox="0 0 32 32" width={size}>
      {kind !== "decoration" && (
        <G>
          <Circle cx={16} cy={16} fill={CHILD_THEME.parchment} r={14.5} stroke={INK} strokeWidth={2.5} />
          <Circle cx={16} cy={16} fill="none" r={12.2} stroke={CHILD_THEME.gold} strokeWidth={1} />
        </G>
      )}
      <Glyph />
    </Svg>
  );
}

type PlayerMarkerProps = { fill?: string; rotationDeg: number; size: number };

/**
 * プレイヤーの向きを示す矢じり。上向きを基準に `rotationDeg` だけ回す。
 *
 * 金の矢じりに濃い茶の縁取りを付け、草・床・冬の雪のどの地面の上でも見えるようにする。
 * `fill` を渡すと金の代わりにその色で塗る（同じ家族の人を色で見分ける。Issue #409）。
 */
export function PlayerMarker({ fill = COLORS.coin, rotationDeg, size }: PlayerMarkerProps) {
  return (
    <Svg height={size} style={{ transform: [{ rotate: `${rotationDeg}deg` }] }} viewBox="0 0 32 32" width={size}>
      <Path d="M16 3 L27 27 L16 21 L5 27 Z" fill={fill} stroke={INK} strokeLinejoin="round" strokeWidth={2.5} />
    </Svg>
  );
}
