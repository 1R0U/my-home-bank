import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";
import type { BuildingMapObject, MapObject, NpcMapObject } from "../../types/map";
import {
  BUILDING_MAP_ICONS,
  BUILDING_MAP_LABELS,
  DECORATION_MAP_ICON,
  MINIMAP_ROTATION_DEG,
  NPC_MAP_ICON,
  PATH_TILE_WORLD_SIZE,
  PLAYER_MAP_ICON,
  facingYToRotationDeg,
  getMapMarkerSizes,
  isWithinMinimapBounds,
  projectToMinimap,
  worldSizeToMinimapPixels,
  type MapIcon,
  type MinimapBounds,
  type MinimapLocation,
} from "../../lib/rpg-hub/minimap";

/** 区画ごとの地の色。町は草、家の中は床のイメージ。 */
const LOCATION_BACKGROUND: Record<MinimapLocation, string> = {
  ground: "bg-amber-800/90",
  town: "bg-emerald-700/90",
  upstairs: "bg-amber-800/90",
};

type MapIconBadgeProps = { icon: MapIcon; size: number };

/**
 * マップのアイコン1個。白い丸の上に Ionicons の絵柄を重ねる（Issue #413）。
 *
 * 絵文字は色付きで地面の色の上でも見分けられたが、Ionicons は単色のため、
 * 白い丸を敷いて草・床のどちらの上でも見えるようにする。箱の大きさを `size` に
 * 固定して中央寄せするので、絵柄の中心が実際の位置からずれない。
 */
function MapIconBadge({ icon, size }: MapIconBadgeProps) {
  return (
    <View
      className="items-center justify-center rounded-full bg-white/90"
      style={{ height: size, width: size }}
    >
      <Ionicons color={icon.color} name={icon.name} size={size * 0.75} />
    </View>
  );
}

type MapMarkersLayerProps = {
  bounds: MinimapBounds;
  buildings: readonly BuildingMapObject[];
  decorations: readonly MapObject[];
  npcs: readonly NpcMapObject[];
  paths: readonly MapObject[];
  showLabels: boolean;
  size: number;
  zoom: number;
};

/**
 * 道・建物・NPC・置いた装飾（＝プレイヤー以外の、動かない物）だけを描く層（1R0Uさんレビュー指摘）。
 *
 * プレイヤーの矢印は毎フレーム位置が変わるが、この層の内容は区画が変わらない限り変わらない。
 * `React.memo` にして、`bounds` / 各配列の参照が変わらない間は描き直さないようにする。
 * - 家の中・2階: `bounds` は区画が変わらない限り同じ参照（RpgHubScreen.tsx の
 *   `houseMinimapBounds`）なので、この層は描き直されない。
 * - 町: `bounds` はプレイヤーを中心に動くが、`RpgHubScreen.tsx` 側で中心座標を
 *   一定間隔に丸めてから作っているため、丸めた格子を越えるまでは同じ参照になる。
 */
const MapMarkersLayer = memo(function MapMarkersLayer({
  bounds,
  buildings,
  decorations,
  npcs,
  paths,
  showLabels,
  size,
  zoom,
}: MapMarkersLayerProps) {
  // `size` は拡大後の大きさ。アイコンも拡大率に合わせて大きく・小さくする（Issue #413）。
  const { decorationIconSize, iconSize, labelFontSize, markerWidth } = getMapMarkerSizes(showLabels, zoom);
  const pathTileSize = worldSizeToMinimapPixels(PATH_TILE_WORLD_SIZE, bounds, size);
  const labelStyle = { fontSize: labelFontSize, lineHeight: labelFontSize * 1.4 } as const;

  return (
    <>
      {/*
        道は地面の目印として最背面に描く。建物・NPC・プレイヤーより上に重ねない。
        町はプレイヤーを中心にスクロールするため、範囲外の物も渡ってくる。
        projectToMinimap は範囲外の座標を端へクランプするため、先に絞り込まないと
        実際に端にある物と区別できなくなる（CodeRabbitレビュー指摘）。
        マップ自体（projectToMinimap）は3Dカメラに合わせて回転させているため、
        正方形のタイルも同じ角度（MINIMAP_ROTATION_DEG）だけ回さないと、まっすぐな道が
        ギザギザに見える（1R0Uさんレビュー指摘）。
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
              transform: [{ rotate: `${MINIMAP_ROTATION_DEG}deg` }],
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
              key={decoration.id}
              style={{
                left: left - decorationIconSize / 2,
                position: "absolute",
                top: top - decorationIconSize / 2,
              }}
            >
              <MapIconBadge icon={DECORATION_MAP_ICON} size={decorationIconSize} />
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
            <MapIconBadge icon={NPC_MAP_ICON} size={iconSize} />
            {showLabels && (
              <Text className="rounded bg-slate-950/60 px-1 text-center text-white" style={labelStyle}>
                {npc.name}
              </Text>
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
              <MapIconBadge icon={BUILDING_MAP_ICONS[building.route]} size={iconSize} />
              {showLabels && (
                <Text className="rounded bg-slate-950/60 px-1 text-center text-white" style={labelStyle}>
                  {BUILDING_MAP_LABELS[building.route]}
                </Text>
              )}
            </View>
          );
        })}
    </>
  );
});

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
  /**
   * 拡大率（全体マップのピンチ。`ZoomableMap` から渡す）。`size` は拡大後の大きさを渡し、
   * アイコン・ラベルはこの比率で大きく・小さくする（Issue #413）。
   */
  zoom?: number;
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
 *
 * **動かない物（道・建物・NPC・装飾）は `MapMarkersLayer` に分けている**
 * （1R0Uさんレビュー指摘：以前は1つのコンポーネントで、プレイヤーが動くたびに
 * 全部を描き直していた）。ここで毎回描き直すのはプレイヤーの矢印だけ。
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
  zoom = 1,
}: HubMapViewProps) {
  const { iconSize } = getMapMarkerSizes(showLabels, zoom);
  const playerRotation = facingYToRotationDeg(player.facingY);
  const { left, top } = projectToMinimap(player.x, player.z, bounds, size);

  return (
    <View
      className={`overflow-hidden rounded-2xl border-2 border-white/70 ${LOCATION_BACKGROUND[location]}`}
      style={{ height: size, width: size }}
    >
      <MapMarkersLayer
        bounds={bounds}
        buildings={buildings}
        decorations={decorations}
        npcs={npcs}
        paths={paths}
        showLabels={showLabels}
        size={size}
        zoom={zoom}
      />
      <View
        className="items-center justify-center"
        style={{ height: iconSize, left: left - iconSize / 2, position: "absolute", top: top - iconSize / 2, width: iconSize }}
      >
        <View accessibilityElementsHidden style={{ transform: [{ rotate: `${playerRotation}deg` }] }}>
          <Ionicons color={PLAYER_MAP_ICON.color} name={PLAYER_MAP_ICON.name} size={iconSize} />
        </View>
      </View>
    </View>
  );
}
