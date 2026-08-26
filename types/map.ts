import type { Href } from "expo-router";

declare const assetIdBrand: unique symbol;

export type AssetId = string & { readonly [assetIdBrand]: true };
export type MapRouteId = "balance-child" | "history" | "store-child" | "tasks-child";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Vector3 = { x: number; y: number; z: number };

type MapObjectBase = {
  collidable: boolean;
  id: string;
  model: AssetId;
  position: Vector3;
  rotationY?: number;
  scale?: number;
};

export type BuildingMapObject = MapObjectBase & {
  collisionSize: { depth: number; width: number };
  interactionRadius: number;
  interactive: true;
  route: MapRouteId;
  type: "building";
};

export type DecorationMapObject = MapObjectBase & {
  interactive: false;
  type: "decoration";
};

export type NpcMapObject = MapObjectBase & {
  dialogueId: string;
  interactionRadius: number;
  interactive: true;
  type: "npc";
};

export type MapObject = BuildingMapObject | DecorationMapObject | NpcMapObject;

export const MAP_ROUTES: Record<MapRouteId, Href> = {
  "balance-child": "/balance-child",
  history: "/history",
  "store-child": "/store-child",
  "tasks-child": "/tasks-child",
};
