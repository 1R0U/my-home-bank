import type { Href } from "expo-router";

declare const assetIdBrand: unique symbol;

export type AssetId = string & { readonly [assetIdBrand]: true };
export type MapRouteId = "bank" | "history" | "store-child" | "tasks-child";

/**
 * オブジェクトごとに差し替えられる色の枠。
 *
 * 形（buildingParts.ts のパーツ）は共通のまま、色だけを1体ずつ変えるための仕組み。
 * NPCを家族の人数ぶん置くとき、1人につき1つアセットを増やすのを避けるために入れた。
 */
export type PaletteSlot = "accent" | "hair" | "skin";
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
  /**
   * パーツの色を枠ごとに上書きする。指定がない枠はパーツ側の色をそのまま使う。
   * 現在はNPCの見た目を1体ずつ変えるために使っている。
   */
  palette?: Partial<Record<PaletteSlot, string>>;
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
  /** 会話データ（lib/rpg-hub/dialogues.ts）を引くためのID */
  dialogueId: string;
  /**
   * このNPCが表す家族の `users.id`。
   *
   * ゆくゆくは家族一人ひとりのキャラクターを立たせたいので、その紐づけ先として持つ。
   * **まだ Supabase とはつないでいない**（今いるNPCは町の住人で、この値を持たない）。
   * つなぐときは、この値を使って会話内容をその人の状況から組み立てる。
   */
  familyMemberId?: string;
  interactionRadius: number;
  interactive: true;
  /** 画面に出す呼び名。「〇〇とはなす」のように使う */
  name: string;
  type: "npc";
};

export type MapObject = BuildingMapObject | DecorationMapObject | NpcMapObject;

export const MAP_ROUTES: Record<MapRouteId, Href> = {
  bank: "/bank",
  history: "/history",
  "store-child": "/store-child",
  "tasks-child": "/tasks-child",
};
