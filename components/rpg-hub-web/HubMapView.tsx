import { memo } from "react";
import { Text, View } from "react-native";
import type { BuildingMapObject, MapObject, Season } from "../../types/map";
import type { FamilyTownMarker } from "../../lib/useFamilyTownPresence.ts";
import {
  BUILDING_MAP_LABELS,
  MINIMAP_ROTATION_DEG,
  PATH_TILE_WORLD_SIZE,
  facingYToRotationDeg,
  getMapGroundColor,
  getMapMarkerSizes,
  isWithinMinimapBounds,
  projectToMinimap,
  worldSizeToMinimapPixels,
  type MinimapBounds,
  type MinimapLocation,
} from "../../lib/rpg-hub/minimap";
import MapMarkerIcon, { PlayerMarker } from "./MapMarkerIcon";

type MapMarkersLayerProps = {
  bounds: MinimapBounds;
  buildings: readonly BuildingMapObject[];
  decorations: readonly MapObject[];
  paths: readonly MapObject[];
  showLabels: boolean;
  size: number;
  zoom: number;
};

/**
 * 道・建物・置いた装飾（＝プレイヤー以外の、動かない物）だけを描く層（1R0Uさんレビュー指摘）。
 *
 * プレイヤーの矢印は毎フレーム位置が変わるが、この層の内容は区画が変わらない限り変わらない。
 * `React.memo` にして、`bounds` / 各配列の参照が変わらない間は描き直さないようにする。
 * - 家の中・2階: `bounds` は区画が変わらない限り同じ参照（RpgHubScreen.tsx の
 *   `houseMinimapBounds`）なので、この層は描き直されない。
 * - 町: `bounds` はプレイヤーを中心に動くが、`RpgHubScreen.tsx` 側で中心座標を
 *   一定間隔に丸めてから作っているため、丸めた格子を越えるまでは同じ参照になる。
 *
 * NPCのアイコン表示は行わない（Issue #409）。代わりに、同じ家族の人が町にいる間の
 * 現在位置を `HubMapView` が別の層（家族の矢印）として描く。こちらは頻繁に動くため、
 * この memo 化された層には含めない。
 */
const MapMarkersLayer = memo(function MapMarkersLayer({
  bounds,
  buildings,
  decorations,
  paths,
  showLabels,
  size,
  zoom,
}: MapMarkersLayerProps) {
  // `size` は拡大後の地図の大きさ。目印は地図ほどは大きくせず、ゆるやかにだけ大きくする（Issue #413）。
  const { decorationIconSize, iconSize, markerWidth } = getMapMarkerSizes(showLabels, zoom);
  const pathTileSize = worldSizeToMinimapPixels(PATH_TILE_WORLD_SIZE, bounds, size);

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
              <MapMarkerIcon kind="decoration" size={decorationIconSize} />
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
              <MapMarkerIcon kind={building.route} size={iconSize} />
              {showLabels && (
                <Text className="rounded bg-slate-950/60 px-1 text-center text-[10px] text-white">
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
  /** 同じ家族で、今「町」にいる人の現在位置（Issue #409）。町以外の区画では渡さない
   * （家の中・2階は人ごとに孤立した座標空間のため、他の家族の位置を重ねる意味がない）。 */
  familyMarkers?: readonly FamilyTownMarker[];
  location: MinimapLocation;
  paths: readonly MapObject[];
  player: { facingY: number; x: number; z: number };
  /** 現在の季節。町の地の色を3Dの地面と同じ季節の色にする（Issue #413）。 */
  season: Season;
  showLabels?: boolean;
  size: number;
  /**
   * 全体マップの拡大率（`ZoomableMap` から渡す）。`size` には拡大後の地図の大きさを渡す。
   * 目印はこの拡大率でゆるやかにだけ大きくする（`getMapMarkerSizes`。Issue #413）。
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
 * プレイヤー・家族の矢印だけが向きに合わせて回る。建物はいま居る区画
 * （町／家の中／2階）のものだけを渡すこと（`filterObjectsByLocation`）。
 *
 * **動かない物（道・建物・装飾）は `MapMarkersLayer` に分けている**
 * （1R0Uさんレビュー指摘：以前は1つのコンポーネントで、プレイヤーが動くたびに
 * 全部を描き直していた）。ここで毎回描き直すのはプレイヤー・家族の矢印だけ。
 */
export default function HubMapView({
  bounds,
  buildings,
  decorations,
  familyMarkers,
  location,
  paths,
  player,
  season,
  showLabels = false,
  size,
  zoom = 1,
}: HubMapViewProps) {
  const { iconSize } = getMapMarkerSizes(showLabels, zoom);
  const playerRotation = facingYToRotationDeg(player.facingY);
  const { left, top } = projectToMinimap(player.x, player.z, bounds, size);

  return (
    <View
      className="overflow-hidden rounded-2xl border-2 border-white/70"
      style={{ backgroundColor: getMapGroundColor(location, season), height: size, width: size }}
    >
      <MapMarkersLayer
        bounds={bounds}
        buildings={buildings}
        decorations={decorations}
        paths={paths}
        showLabels={showLabels}
        size={size}
        zoom={zoom}
      />
      {familyMarkers
        ?.filter((marker) => isWithinMinimapBounds(marker.x, marker.z, bounds))
        .map((marker) => {
          const projected = projectToMinimap(marker.x, marker.z, bounds, size);
          const rotation = facingYToRotationDeg(marker.facingY);
          return (
            <View
              accessibilityElementsHidden
              className="items-center justify-center"
              key={marker.id}
              style={{
                height: iconSize,
                left: projected.left - iconSize / 2,
                position: "absolute",
                top: projected.top - iconSize / 2,
                width: iconSize,
              }}
            >
              <PlayerMarker fill={marker.color} rotationDeg={rotation} size={iconSize} />
            </View>
          );
        })}
      <View
        className="items-center justify-center"
        style={{ height: iconSize, left: left - iconSize / 2, position: "absolute", top: top - iconSize / 2, width: iconSize }}
      >
        <View accessibilityElementsHidden>
          <PlayerMarker rotationDeg={playerRotation} size={iconSize} />
        </View>
      </View>
    </View>
  );
}
