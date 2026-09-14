import type { Href } from "expo-router";

declare const assetIdBrand: unique symbol;

export type AssetId = string & { readonly [assetIdBrand]: true };
export type MapRouteId = "bank" | "history" | "store-child" | "tasks-child";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Vector3 = { x: number; y: number; z: number };

type MapObjectBase = {
  collidable: boolean;
  /**
   * 衝突判定に使う大きさ（見た目の大きさとは別に持つ）。
   * 木のように上へ広がるものは、幹に合わせて見た目より小さくしたほうが歩きやすい。
   * `collidable: true` のオブジェクトはこれを必ず持つ（持たないものは判定対象にならない）。
   */
  collisionSize?: { depth: number; width: number };
  id: string;
  model: AssetId;
  position: Vector3;
  rotationY?: number;
  scale?: number;
};

export type BuildingMapObject = MapObjectBase & {
  /** 建物は必ず衝突する大きさを持つ。 */
  collisionSize: { depth: number; width: number };
  /** 建物正面（見た目上の扉の位置）を示す position からのオフセット。接近判定の基準点として使う */
  entranceOffset: Vector3;
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
  bank: "/bank",
  history: "/history",
  "store-child": "/store-child",
  "tasks-child": "/tasks-child",
};
