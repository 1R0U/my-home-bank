import { render, screen } from "@testing-library/react-native";
import { describe, expect, jest, test } from "@jest/globals";
import HubMapView from "../components/rpg-hub-web/HubMapView";
import MapMarkerIcon from "../components/rpg-hub-web/MapMarkerIcon";
import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { isWithinMinimapBounds } from "../lib/rpg-hub/minimap";
import type { BuildingMapObject, MapRouteId } from "../types/map";

// RNTL v14 は自作の部品を型で探せないため、目印の種類と大きさを testID に出す（実物もそのまま描く）
jest.mock("../components/rpg-hub-web/MapMarkerIcon", () => {
  const actual = jest.requireActual<typeof import("../components/rpg-hub-web/MapMarkerIcon")>("../components/rpg-hub-web/MapMarkerIcon");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => <View testID={`marker:${props.kind}:${props.size}`}><actual.default {...props} /></View>,
    PlayerMarker: (props: Parameters<typeof actual.PlayerMarker>[0]) => <View testID={`marker:player:${props.size}`}><actual.PlayerMarker {...props} /></View>,
  };
});

function markers() {
  return screen.getAllByTestId(/^marker:/).map((node) => {
    const [, kind, size] = String(node.props.testID).split(":");
    return { kind, size: Number(size) };
  });
}

const BUILDINGS = INITIAL_MAP_OBJECTS.filter((object): object is BuildingMapObject => object.type === "building");
const BOUNDS = { maxX: 40, maxZ: 40, minX: -40, minZ: -40 };

async function renderMap(size: number, zoom = 1) {
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
  test("地図を3倍に拡大しても、目印は1.5倍までしか大きくならない", async () => {
    const sizesAt = async (size: number, zoom: number) => {
      await renderMap(size, zoom);
      return markers().map((marker) => marker.size);
    };
    const atOneX = await sizesAt(300, 1);
    const atThreeX = await sizesAt(900, 3);
    expect(atOneX.length).toBeGreaterThan(0);
    expect(atThreeX).toEqual(atOneX.map((size) => size * 1.5));
  });

  test("範囲内の建物を、その建物用の目印で描く", async () => {
    await renderMap(300);
    const kinds = markers().filter((marker) => marker.kind !== "player").map((marker) => marker.kind as MapRouteId);
    const expected = BUILDINGS.filter((building) =>
      isWithinMinimapBounds(building.position.x, building.position.z, BOUNDS),
    ).map((building) => building.route);
    expect(expected.length).toBeGreaterThan(0);
    expect(kinds.sort()).toEqual(expected.sort());
  });

  test("すべての目印の種類を描ける", async () => {
    const kinds = [...new Set(BUILDINGS.map((building) => building.route)), "npc", "decoration"] as const;
    for (const kind of kinds) {
      // v14 の render は Promise を返し、描画に失敗すると reject されてテストが落ちる
      await render(<MapMarkerIcon kind={kind} size={26} />);
    }
  });
});
