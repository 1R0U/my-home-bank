import { render } from "@testing-library/react-native";
import { describe, expect, test } from "@jest/globals";
import HubMapView from "../components/rpg-hub-web/HubMapView";
import MapMarkerIcon, { PlayerMarker } from "../components/rpg-hub-web/MapMarkerIcon";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { isWithinMinimapBounds } from "../lib/rpg-hub/minimap";
import type { FamilyTownMarker } from "../lib/useFamilyTownPresence";
import type { BuildingMapObject, MapRouteId } from "../types/map";

const BUILDINGS = INITIAL_MAP_OBJECTS.filter((object): object is BuildingMapObject => object.type === "building");
const BOUNDS = { maxX: 40, maxZ: 40, minX: -40, minZ: -40 };

function renderMap(size: number, zoom = 1, familyMarkers?: readonly FamilyTownMarker[]) {
  return render(
    <HubMapView
      bounds={BOUNDS}
      buildings={BUILDINGS}
      decorations={[]}
      familyMarkers={familyMarkers}
      location="town"
      paths={[]}
      player={{ facingY: 0, x: 0, z: 0 }}
      season="autumn"
      showLabels
      size={size}
      zoom={zoom}
    />,
  );
}

describe("HubMapView の目印（Issue #413）", () => {
  test("地図を3倍に拡大しても、目印は1.5倍までしか大きくならない", () => {
    const sizesAt = (size: number, zoom: number) => {
      const { UNSAFE_getAllByType } = renderMap(size, zoom);
      return [
        ...UNSAFE_getAllByType(MapMarkerIcon).map((icon) => icon.props.size),
        ...UNSAFE_getAllByType(PlayerMarker).map((icon) => icon.props.size),
      ];
    };
    const atOneX = sizesAt(300, 1);
    const atThreeX = sizesAt(900, 3);
    expect(atOneX.length).toBeGreaterThan(0);
    expect(atThreeX).toEqual(atOneX.map((size) => size * 1.5));
  });

  test("範囲内の建物を、その建物用の目印で描く", () => {
    const { UNSAFE_getAllByType } = renderMap(300);
    const kinds = UNSAFE_getAllByType(MapMarkerIcon).map((icon) => icon.props.kind as MapRouteId);
    const expected = BUILDINGS.filter((building) =>
      isWithinMinimapBounds(building.position.x, building.position.z, BOUNDS),
    ).map((building) => building.route);
    expect(expected.length).toBeGreaterThan(0);
    expect(kinds.sort()).toEqual(expected.sort());
  });

  test("すべての目印の種類を描ける", () => {
    const kinds = [...new Set(BUILDINGS.map((building) => building.route)), "npc", "decoration"] as const;
    for (const kind of kinds) {
      expect(() => render(<MapMarkerIcon kind={kind} size={26} />)).not.toThrow();
    }
  });
});

describe("HubMapView の家族の矢印（Issue #409）", () => {
  test("familyMarkersを渡さなければ、矢じりはプレイヤー自身の1本だけ", () => {
    const { UNSAFE_getAllByType } = renderMap(300);
    expect(UNSAFE_getAllByType(PlayerMarker)).toHaveLength(1);
  });

  test("familyMarkersを渡すと、人ごとに色分けした矢じりが追加で描かれる", () => {
    const markers: FamilyTownMarker[] = [
      { color: "#ef4444", facingY: 0, id: "member-1", x: 10, z: 10 },
      { color: "#3b82f6", facingY: Math.PI, id: "member-2", x: -10, z: -10 },
    ];
    const { UNSAFE_getAllByType } = renderMap(300, 1, markers);

    const arrows = UNSAFE_getAllByType(PlayerMarker);
    // プレイヤー自身 + 家族2人
    expect(arrows).toHaveLength(3);

    const fills = arrows.map((arrow) => arrow.props.fill);
    expect(fills).toContain("#ef4444");
    expect(fills).toContain("#3b82f6");
    // プレイヤー自身の矢じりには色（fill）を指定していない（既定色のまま）
    expect(fills.filter((fill) => fill === undefined)).toHaveLength(1);
  });

  test("表示範囲の外にいる家族の矢じりは描かない", () => {
    const markers: FamilyTownMarker[] = [{ color: "#ef4444", facingY: 0, id: "far-away", x: 10000, z: 10000 }];
    const { UNSAFE_getAllByType } = renderMap(300, 1, markers);

    // プレイヤー自身の1本だけ（範囲外の家族は描かれない）
    expect(UNSAFE_getAllByType(PlayerMarker)).toHaveLength(1);
  });
});
