import { Text, View } from "react-native";
import type { BuildingMapObject, MapObject, NpcMapObject } from "../../types/map";
import {
  BUILDING_MAP_ICONS,
  BUILDING_MAP_LABELS,
  DECORATION_MAP_ICON,
  NPC_MAP_ICON,
  PATH_TILE_WORLD_SIZE,
  facingYToRotationDeg,
  isWithinMinimapBounds,
  projectToMinimap,
  worldSizeToMinimapPixels,
  type MinimapBounds,
  type MinimapLocation,
} from "../../lib/rpg-hub/minimap";

/** 区画ごとの地の色。町は草、家の中は床のイメージ。 */
const LOCATION_BACKGROUND: Record<MinimapLocation, string> = {
  ground: "bg-amber-800/90",
  town: "bg-emerald-700/90",
  upstairs: "bg-amber-800/90",
};

/** ラベル付き表示のときの、アイコン＋ラベル1個あたりの横幅。ラベルがアイコンより広いため、
 * アイコン単体の幅ではなく、この固定幅を基準に中央寄せする（1R0Uさんレビュー指摘）。 */
const LABELED_MARKER_WIDTH = 72;

type HubMapViewProps = {
  bounds: MinimapBounds;
  buildings: readonly BuildingMapObject[];
  decorations: readonly MapObject[];
  location: MinimapLocation;
  npcs: readonly NpcMapObject[];
  paths: readonly MapObject[];
  player: { facingY: number; x: number; z: number };
  showLabels?: boolean;
  size: number;
};

/**
 * 我が家タウン（RPGハブ）のマップ表示（Issue #314）。
 *
 * 常時表示の小さいミニマップと、タップで開く全体マップの両方に使う共通の見た目。
 * シーン（WebView／Babylon.js）とは独立に、RN側が持っている情報
 * （`objects` / `placedDecorations` / position イベント由来の `player`）だけで描く。
 *
 * 向きは3Dカメラと同じに合わせる（`lib/rpg-hub/minimap.ts` の `toScreenPlane`）。
 * プレイヤーの矢印だけが向きに合わせて回る。建物・NPCはいま居る区画
 * （町／家の中／2階）のものだけを渡すこと（`filterObjectsByLocation`）。
 */
export default function HubMapView({
  bounds,
  buildings,
  decorations,
  location,
  npcs,
  paths,
  player,
  showLabels = false,
  size,
}: HubMapViewProps) {
  const iconSize = showLabels ? 26 : 14;
  const decorationIconSize = iconSize * 0.7;
  const playerRotation = facingYToRotationDeg(player.facingY);
  const pathTileSize = worldSizeToMinimapPixels(PATH_TILE_WORLD_SIZE, bounds, size);
  const markerWidth = showLabels ? LABELED_MARKER_WIDTH : iconSize;

  /**
   * アイコンの文字そのものの箱（`lineHeight` を `fontSize` と揃え、Androidの
   * 余分な字詰め padding を外す）を、`iconSize` と同じ大きさの箱で包んで中央寄せする。
   * **これをしないと、Textは行の高さの分だけfontSizeより縦に大きくなり、見た目の
   * 中心が実際の位置からずれる**（1R0Uさんレビュー指摘）。
   */
  const iconTextStyle = { fontSize: iconSize, includeFontPadding: false, lineHeight: iconSize } as const;

  return (
    <View
      className={`overflow-hidden rounded-2xl border-2 border-white/70 ${LOCATION_BACKGROUND[location]}`}
      style={{ height: size, width: size }}
    >
      {/*
        道は地面の目印として最背面に描く。建物・NPC・プレイヤーより上に重ねない。
        町はプレイヤーを中心にスクロールするため、範囲外の物も渡ってくる。
        projectToMinimap は範囲外の座標を端へクランプするため、先に絞り込まないと
        実際に端にある物と区別できなくなる（CodeRabbitレビュー指摘）。
      */}
      {paths.filter((path) => isWithinMinimapBounds(path.position.x, path.position.z, bounds)).map((path) => {
        const { left, top } = projectToMinimap(path.position.x, path.position.z, bounds, size);
        return (
          <View
            className="bg-amber-100/70"
            key={path.id}
            style={{
              height: pathTileSize.height,
              left: left - pathTileSize.width / 2,
              position: "absolute",
              top: top - pathTileSize.height / 2,
              width: pathTileSize.width,
            }}
          />
        );
      })}
      {decorations
        .filter((decoration) => isWithinMinimapBounds(decoration.position.x, decoration.position.z, bounds))
        .map((decoration) => {
          const { left, top } = projectToMinimap(decoration.position.x, decoration.position.z, bounds, size);
          return (
            <View
              className="items-center justify-center"
              key={decoration.id}
              style={{
                height: decorationIconSize,
                left: left - decorationIconSize / 2,
                position: "absolute",
                top: top - decorationIconSize / 2,
                width: decorationIconSize,
              }}
            >
              <Text
                style={{
                  fontSize: decorationIconSize,
                  includeFontPadding: false,
                  lineHeight: decorationIconSize,
                }}
              >
                {DECORATION_MAP_ICON}
              </Text>
            </View>
          );
        })}
      {npcs.filter((npc) => isWithinMinimapBounds(npc.position.x, npc.position.z, bounds)).map((npc) => {
        const { left, top } = projectToMinimap(npc.position.x, npc.position.z, bounds, size);
        return (
          <View
            className="items-center"
            key={npc.id}
            style={{ left: left - markerWidth / 2, position: "absolute", top: top - iconSize / 2, width: markerWidth }}
          >
            <Text style={iconTextStyle}>{NPC_MAP_ICON}</Text>
            {showLabels && (
              <Text className="rounded bg-slate-950/60 px-1 text-center text-[10px] text-white">{npc.name}</Text>
            )}
          </View>
        );
      })}
      {buildings
        .filter((building) => isWithinMinimapBounds(building.position.x, building.position.z, bounds))
        .map((building) => {
          const { left, top } = projectToMinimap(building.position.x, building.position.z, bounds, size);
          return (
            <View
              className="items-center"
              key={building.id}
              style={{
                left: left - markerWidth / 2,
                position: "absolute",
                top: top - iconSize / 2,
                width: markerWidth,
              }}
            >
              <Text style={iconTextStyle}>{BUILDING_MAP_ICONS[building.route]}</Text>
              {showLabels && (
                <Text className="rounded bg-slate-950/60 px-1 text-center text-[10px] text-white">
                  {BUILDING_MAP_LABELS[building.route]}
                </Text>
              )}
            </View>
          );
        })}
      {(() => {
        const { left, top } = projectToMinimap(player.x, player.z, bounds, size);
        return (
          <View
            className="items-center justify-center"
            style={{ height: iconSize, left: left - iconSize / 2, position: "absolute", top: top - iconSize / 2, width: iconSize }}
          >
            <Text
              accessibilityElementsHidden
              style={{ ...iconTextStyle, transform: [{ rotate: `${playerRotation}deg` }] }}
            >
              ▲
            </Text>
          </View>
        );
      })()}
    </View>
  );
}
