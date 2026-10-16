import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { BuildingMapObject, MapObject, NpcMapObject, Season } from "../../types/map";
import {
  MINIMAP_ROTATION_DEG,
  PATH_TILE_WORLD_SIZE,
  facingYToRotationDeg,
  getBuildingMapLabel,
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
  /** 渡すと建物アイコンがタップ可能になり、ワープに使う（Issue #406）。常時表示の
   * 小さいミニマップでは渡さず、タップで開く全体マップでだけ渡す（誤操作防止）。 */
  onBuildingPress?: (building: BuildingMapObject) => void;
  npcs: readonly NpcMapObject[];
  /** 家族一人ひとりの家（Issue #244）のラベルに名前を出すための、`users.id` → 名前の対応。 */
  ownerNames: Readonly<Record<string, string>>;
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
  onBuildingPress,
  npcs,
  ownerNames,
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
      {npcs.filter((npc) => isWithinMinimapBounds(npc.position.x, npc.position.z, bounds)).map((npc) => {
        const { left, top } = projectToMinimap(npc.position.x, npc.position.z, bounds, size);
        return (
          <View
            className="items-center"
            key={npc.id}
            style={{ left: left - markerWidth / 2, position: "absolute", top: top - iconSize / 2, width: markerWidth }}
          >
            <MapMarkerIcon kind="npc" size={iconSize} />
            {showLabels && (
              <Text className="rounded bg-slate-950/60 px-1 text-center text-[10px] text-white">
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
          const label = getBuildingMapLabel(building, ownerNames);
          const content = (
            <>
              <MapMarkerIcon kind={building.route} size={iconSize} />
              {showLabels && (
                <Text className="rounded bg-slate-950/60 px-1 text-center text-[10px] text-white">{label}</Text>
              )}
            </>
          );
          const style = {
            left: left - markerWidth / 2,
            position: "absolute" as const,
            top: top - iconSize / 2,
            width: markerWidth,
          };
          // onBuildingPress が無い（常時表示のミニマップ）ときはタップ不可のただの表示にする
          // （誤操作防止。Issue #406）。
          if (!onBuildingPress) {
            return (
              <View className="items-center" key={building.id} style={style}>
                {content}
              </View>
            );
          }
          return (
            <Pressable
              accessibilityLabel={`${label}へワープ`}
              accessibilityRole="button"
              className="items-center"
              hitSlop={8}
              key={building.id}
              onPress={() => onBuildingPress(building)}
              style={style}
            >
              {content}
            </Pressable>
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
  /** 渡すと建物アイコンがタップ可能になり、ワープに使う（Issue #406）。 */
  onBuildingPress?: (building: BuildingMapObject) => void;
  npcs: readonly NpcMapObject[];
  /** 家族一人ひとりの家（Issue #244）のラベルに名前を出すための、`users.id` → 名前の対応。 */
  ownerNames?: Readonly<Record<string, string>>;
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
 * プレイヤーの矢印だけが向きに合わせて回る。建物・NPCはいま居る区画
 * （町／家の中／2階）のものだけを渡すこと（`filterObjectsByLocation`）。
 *
 * **動かない物（道・建物・NPC・装飾）は `MapMarkersLayer` に分けている**
 * （1R0Uさんレビュー指摘：以前は1つのコンポーネントで、プレイヤーが動くたびに
 * 全部を描き直していた）。ここで毎回描き直すのはプレイヤーの矢印だけ。
 */
/** `ownerNames` を省略したとき用の、参照が変わらない空の対応（`MapMarkersLayer` のmemo化を保つため）。 */
const EMPTY_OWNER_NAMES: Readonly<Record<string, string>> = {};

export default function HubMapView({
  bounds,
  buildings,
  decorations,
  location,
  onBuildingPress,
  npcs,
  ownerNames = EMPTY_OWNER_NAMES,
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
        onBuildingPress={onBuildingPress}
        npcs={npcs}
        ownerNames={ownerNames}
        paths={paths}
        showLabels={showLabels}
        size={size}
        zoom={zoom}
      />
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
