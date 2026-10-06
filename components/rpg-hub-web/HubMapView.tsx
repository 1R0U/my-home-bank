import { Text, View } from "react-native";
import type { BuildingMapObject, MapObject, NpcMapObject } from "../../types/map";
import {
  BUILDING_MAP_ICONS,
  DECORATION_MAP_ICON,
  NPC_MAP_ICON,
  facingYToRotationDeg,
  projectToMinimap,
  type MinimapBounds,
  type MinimapLocation,
} from "../../lib/rpg-hub/minimap";

const BUILDING_LABELS: Record<string, string> = {
  bank: "銀行",
  downstairs: "下りる階段",
  history: "履歴",
  house: "自分の家",
  store: "ストア",
  tasks: "タスク",
  upstairs: "上る階段",
  wardrobe: "姿見",
};

/** 区画ごとの地の色。町は草、家の中は床のイメージ。 */
const LOCATION_BACKGROUND: Record<MinimapLocation, string> = {
  ground: "bg-amber-800/90",
  town: "bg-emerald-700/90",
  upstairs: "bg-amber-800/90",
};

type HubMapViewProps = {
  bounds: MinimapBounds;
  buildings: readonly BuildingMapObject[];
  decorations: readonly MapObject[];
  location: MinimapLocation;
  npcs: readonly NpcMapObject[];
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
 * 向きは北を上に固定（マップ自体は回転しない）。プレイヤーの矢印だけが向きに合わせて回る。
 * 建物・NPCはいま居る区画（町／家の中／2階）のものだけを渡すこと（`filterObjectsByLocation`）。
 */
export default function HubMapView({
  bounds,
  buildings,
  decorations,
  location,
  npcs,
  player,
  showLabels = false,
  size,
}: HubMapViewProps) {
  const iconSize = showLabels ? 22 : 14;
  const playerRotation = facingYToRotationDeg(player.facingY);

  return (
    <View
      className={`overflow-hidden rounded-2xl border-2 border-white/70 ${LOCATION_BACKGROUND[location]}`}
      style={{ height: size, width: size }}
    >
      {decorations.map((decoration) => {
        const { left, top } = projectToMinimap(decoration.position.x, decoration.position.z, bounds, size);
        return (
          <Text
            key={decoration.id}
            style={{ fontSize: iconSize * 0.7, left: left - 6, position: "absolute", top: top - 6 }}
          >
            {DECORATION_MAP_ICON}
          </Text>
        );
      })}
      {npcs.map((npc) => {
        const { left, top } = projectToMinimap(npc.position.x, npc.position.z, bounds, size);
        return (
          <View key={npc.id} style={{ left: left - iconSize / 2, position: "absolute", top: top - iconSize / 2 }}>
            <Text style={{ fontSize: iconSize }}>{NPC_MAP_ICON}</Text>
            {showLabels && <Text className="text-center text-[9px] text-white">{npc.name}</Text>}
          </View>
        );
      })}
      {buildings.map((building) => {
        const { left, top } = projectToMinimap(building.position.x, building.position.z, bounds, size);
        return (
          <View
            key={building.id}
            style={{ left: left - iconSize / 2, position: "absolute", top: top - iconSize / 2 }}
          >
            <Text style={{ fontSize: iconSize }}>{BUILDING_MAP_ICONS[building.route]}</Text>
            {showLabels && (
              <Text className="text-center text-[9px] text-white">{BUILDING_LABELS[building.route]}</Text>
            )}
          </View>
        );
      })}
      {(() => {
        const { left, top } = projectToMinimap(player.x, player.z, bounds, size);
        return (
          <Text
            accessibilityElementsHidden
            style={{
              fontSize: iconSize,
              left: left - iconSize / 2,
              position: "absolute",
              top: top - iconSize / 2,
              transform: [{ rotate: `${playerRotation}deg` }],
            }}
          >
            ▲
          </Text>
        );
      })()}
    </View>
  );
}
