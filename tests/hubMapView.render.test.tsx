import { render, screen } from "@testing-library/react-native";
import { expect, test } from "@jest/globals";
import { Text } from "react-native";
import HubMapView from "../components/rpg-hub-web/HubMapView";
import type { FamilyTownMarker } from "../lib/useFamilyTownPresence";

const BOUNDS = { maxX: 50, maxZ: 50, minX: -50, minZ: -50 };

/** ▲（矢印）だけのTextを探す。accessibilityElementsHiddenのためgetByTextでは拾えない。 */
const findArrows = () => screen.UNSAFE_getAllByType(Text).filter((node) => node.props.children === "▲");

test("familyMarkersを渡さなければ、矢印はプレイヤー自身の1本だけ", () => {
  render(
    <HubMapView
      bounds={BOUNDS}
      buildings={[]}
      decorations={[]}
      location="town"
      paths={[]}
      player={{ facingY: 0, x: 0, z: 0 }}
      size={100}
    />,
  );

  expect(findArrows()).toHaveLength(1);
});

test("familyMarkersを渡すと、人ごとに色分けした矢印が追加で描かれる", () => {
  const markers: FamilyTownMarker[] = [
    { color: "#ef4444", facingY: 0, id: "member-1", x: 10, z: 10 },
    { color: "#3b82f6", facingY: Math.PI, id: "member-2", x: -10, z: -10 },
  ];

  render(
    <HubMapView
      bounds={BOUNDS}
      buildings={[]}
      decorations={[]}
      familyMarkers={markers}
      location="town"
      paths={[]}
      player={{ facingY: 0, x: 0, z: 0 }}
      size={100}
    />,
  );

  const arrows = findArrows();
  // プレイヤー自身 + 家族2人
  expect(arrows).toHaveLength(3);

  const colors = arrows.map((arrow) => arrow.props.style?.color);
  expect(colors).toContain("#ef4444");
  expect(colors).toContain("#3b82f6");
  // プレイヤー自身の矢印には色を指定していない（既定色のまま）
  expect(colors.filter((color) => color === undefined)).toHaveLength(1);
});

test("表示範囲の外にいる家族の矢印は描かない", () => {
  const markers: FamilyTownMarker[] = [{ color: "#ef4444", facingY: 0, id: "far-away", x: 10000, z: 10000 }];

  render(
    <HubMapView
      bounds={BOUNDS}
      buildings={[]}
      decorations={[]}
      familyMarkers={markers}
      location="town"
      paths={[]}
      player={{ facingY: 0, x: 0, z: 0 }}
      size={100}
    />,
  );

  // プレイヤー自身の1本だけ（範囲外の家族は描かれない）
  expect(findArrows()).toHaveLength(1);
});
