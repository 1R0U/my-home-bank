import { render } from "@testing-library/react-native";
import { describe, expect, test } from "@jest/globals";
import HubMapView from "../components/rpg-hub-web/HubMapView";
import MapMarkerIcon, { PlayerMarker } from "../components/rpg-hub-web/MapMarkerIcon";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { isWithinMinimapBounds } from "../lib/rpg-hub/minimap";
import type { BuildingMapObject, MapRouteId } from "../types/map";

const BUILDINGS = INITIAL_MAP_OBJECTS.filter((object): object is BuildingMapObject => object.type === "building");
const BOUNDS = { maxX: 40, maxZ: 40, minX: -40, minZ: -40 };

function renderMap(size: number, zoom = 1) {
  return render(
    <HubMapView
      bounds={BOUNDS}
      buildings={BUILDINGS}
      decorations={[]}
      location="town"
      npcs={[]}
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
