// 自分の家の中（Issue #444）。
//
// 我が家タウンと同じ3Dシーンの中に、町から離れた場所に部屋を1つ置く。
// 町の家（route "house"）と家の中の玄関（"exit"）の間は、画面遷移ではなくテレポートで
// 行き来する（RpgHubScreen.tsx の handleTeleportRoute）。部屋の中は町と同じように前後左右へ歩ける。
//
// シルバニアファミリーの家のように、壁は奥と左だけにして、手前（+Z、カメラの側）と右は開けておく
// （床の外へ歩いて出ないよう、見えない壁だけを置く）。手前の辺の真ん中から玄関（土間）が
// 手前へ四角く飛び出していて、町から入ると玄関の先に立ち、奥へ向かって歩いていく。
// 奥の壁には、クローゼット（きがえ）・窓・ソファ・植木を並べる。
// （真横から見ていた家の中（Issue #386）にあった2階と階段は、いったん無くした。）
//
// 機能のある家具は建物（type: "building"）として置き、近づくと出るボタンで使える。
// 何をする家具か押す前から分かるよう、名札（tag）を付けて上に浮かべる（#386 で挙がった
// 「機能の場所が分かりにくい」への対応）。
//
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数と定数のみ。

import type { BuildingMapObject, DecorationMapObject, MapObject, MapRouteId, Vector3 } from "../../types/map";
import { RPG_HUB_ASSETS } from "./assets.ts";
import {
  getFurnitureWidth,
  HOUSE_ENTRANCE_SIZE,
  HOUSE_FURNITURE_SHAPES,
  HOUSE_ROOM_SIZE,
  HOUSE_WALL_TILE_LENGTH,
  type HouseFurnitureKind,
} from "./houseInteriorParts.ts";

/**
 * 部屋の中心座標。
 *
 * 町（原点付近）から離れた場所に置く。`scatterNature` が自然物を散らす範囲
 * （`SCATTER_HALF` = 34）の外なので、家の中に木や岩が生えてこない。
 *
 * **`placed_decorations` の `position_z between -100 and 100` 制約に収まる範囲に置く。**
 * 外へ動かすと、家の中で「かざる」操作が必ずDBのcheck制約違反で失敗する（Issue #235）。
 *
 * **以前の3Dの家の中（Issue #235）の区画（`LEGACY_HOUSE_ZONE_BOUNDS`）と重ねない。**
 * 重ねると、そのころに置いた装飾が新しい部屋の中に現れ、入った直後に重なって動けなくなる
 * ことがある。旧区画の装飾はマイグレーション（remove_legacy_house_decorations）で片付けたが、
 * 区画を分けておけば、片付けを適用する前の環境でも新しい部屋には入り込まない。
 */
export const HOUSE_ROOM_CENTER = { x: 0, z: -76 } as const;

/**
 * 以前の3Dの家の中（Issue #235）の区画（1階・2階の壁の外周）。新しい部屋はここと重ねない。
 * この中に置かれた装飾は、マイグレーション（remove_legacy_house_decorations）で片付けた。
 * 値はそのマイグレーションの SQL と同じ。
 */
export const LEGACY_HOUSE_ZONE_BOUNDS = [
  { maxX: 12, maxZ: -51, minX: -6, minZ: -66 },
  { maxX: 6, maxZ: -84, minX: -6, minZ: -96 },
] as const;

/** 家具の名札。何をする家具か、近づく前から分かるようにする（子供が読むので、ひらがな） */
const TAGS: Partial<Record<MapRouteId, string>> = {
  exit: "そとへ",
  wardrobe: "きがえ",
};

/** 機能のある家具に近づいたとみなす距離 */
const FURNITURE_INTERACTION_RADIUS = 1.5;

/** 奥の壁と家具の間に空ける隙間。ぴったり付けると、壁と家具の面がちらつく */
const WALL_GAP = 0.05;

/** 奥の壁に並べる家具。x は部屋の中心からの横の位置。どれも正面（+Z）を部屋へ向ける */
type FurniturePlacement = {
  id: string;
  kind: HouseFurnitureKind;
  /** 機能のある家具だけが持つ。持たない家具は飾り */
  route?: MapRouteId;
  x: number;
};

const BACK_WALL_FURNITURE: readonly FurniturePlacement[] = [
  { id: "house-closet", kind: "closet", route: "wardrobe", x: -3.2 },
  { id: "house-window", kind: "window", x: 0.6 },
  { id: "house-sofa", kind: "sofa", x: 0.6 },
  { id: "house-plant", kind: "plant", x: 3.2 },
];

/** 家具の種類 → 見た目のアセット */
const FURNITURE_ASSETS: Record<HouseFurnitureKind, keyof typeof RPG_HUB_ASSETS> = {
  closet: "houseCloset",
  door: "houseDoor",
  plant: "housePlant",
  sofa: "houseSofa",
  window: "houseWindow",
};

/** 横向き（左の壁）に置く壁の向き。壁の内側（+Z）を +X へ向ける */
const SIDE_WALL_ROTATION = Math.PI / 2;

const BACK_Z = HOUSE_ROOM_CENTER.z - HOUSE_ROOM_SIZE.depth / 2;
const FRONT_Z = HOUSE_ROOM_CENTER.z + HOUSE_ROOM_SIZE.depth / 2;
const LEFT_X = HOUSE_ROOM_CENTER.x - HOUSE_ROOM_SIZE.width / 2;
const RIGHT_X = HOUSE_ROOM_CENTER.x + HOUSE_ROOM_SIZE.width / 2;

/** 玄関（土間）の左右の端と、先の端。部屋の手前の見えない壁（厚み wallThickness）の外から飛び出す */
const ENTRANCE_LEFT_X = HOUSE_ROOM_CENTER.x - HOUSE_ENTRANCE_SIZE.width / 2;
const ENTRANCE_RIGHT_X = HOUSE_ROOM_CENTER.x + HOUSE_ENTRANCE_SIZE.width / 2;
const ENTRANCE_START_Z = FRONT_Z + HOUSE_ROOM_SIZE.wallThickness;
const ENTRANCE_END_Z = ENTRANCE_START_Z + HOUSE_ENTRANCE_SIZE.depth;

/**
 * 奥・左の高い壁を1列並べる。
 * @param idPrefix - オブジェクトIDの接頭辞
 * @param axis - 壁を伸ばす向き（x: 奥の壁、z: 左の壁）
 * @param fixed - 伸ばさない側の座標
 * @param from - 伸ばす向きの、列の始まり
 * @param to - 伸ばす向きの、列の終わり（`HOUSE_WALL_TILE_LENGTH` で割り切れる長さにする）
 * @returns 壁のオブジェクト
 */
function wallLine(idPrefix: string, axis: "x" | "z", fixed: number, from: number, to: number): DecorationMapObject[] {
  const tileLength = HOUSE_WALL_TILE_LENGTH;
  const count = Math.round((to - from) / tileLength);
  return Array.from({ length: count }, (_, index) => {
    const along = from + tileLength * (index + 0.5);
    return {
      collidable: true,
      collisionSize: { depth: HOUSE_ROOM_SIZE.wallThickness, width: tileLength },
      id: `${idPrefix}-${index}`,
      interactive: false,
      model: RPG_HUB_ASSETS.houseWall,
      position: axis === "x" ? { x: along, y: 0, z: fixed } : { x: fixed, y: 0, z: along },
      rotationY: axis === "x" ? 0 : SIDE_WALL_ROTATION,
      type: "decoration",
    };
  });
}

/**
 * 見えない壁を1つ置く（カタログで描かないアセット）。当たり判定の四角だけを持つ。
 * @param id - オブジェクトID
 * @param minX - 左の端
 * @param maxX - 右の端
 * @param minZ - 奥の端
 * @param maxZ - 手前の端
 * @returns 見えない壁のオブジェクト
 */
function invisibleWall(id: string, minX: number, maxX: number, minZ: number, maxZ: number): DecorationMapObject {
  return {
    collidable: true,
    collisionSize: { depth: maxZ - minZ, width: maxX - minX },
    id,
    interactive: false,
    model: RPG_HUB_ASSETS.houseInvisibleWall,
    position: { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 },
    type: "decoration",
  };
}

/**
 * 家具を1つ置く。機能のある家具は建物に、そのほかは飾りにする。
 * @param id - オブジェクトID
 * @param kind - 家具の種類
 * @param position - 置く位置
 * @param route - 機能のある家具の行き先。飾りなら undefined
 * @param entranceOffset - 使うときに立つ側（家具の正面）。position からのずれ
 * @returns 家具のオブジェクト
 */
function furnitureObject(
  id: string,
  kind: HouseFurnitureKind,
  position: Vector3,
  route: MapRouteId | undefined,
  entranceOffset: Vector3,
): MapObject {
  const shape = HOUSE_FURNITURE_SHAPES[kind];
  const model = RPG_HUB_ASSETS[FURNITURE_ASSETS[kind]];
  const collisionSize = { depth: shape.depth, width: getFurnitureWidth(kind) };

  if (route) {
    const building: BuildingMapObject = {
      collidable: true,
      collisionSize,
      entranceOffset,
      id,
      interactionRadius: FURNITURE_INTERACTION_RADIUS,
      interactive: true,
      model,
      position,
      route,
      ...(TAGS[route] ? { tag: TAGS[route] } : {}),
      type: "building",
    };
    return building;
  }
  // 壁に掛ける物（窓）は床の上の家具と重なるので、当たり判定を持たせない
  return {
    collidable: !shape.onWall,
    ...(shape.onWall ? {} : { collisionSize }),
    id,
    interactive: false,
    model,
    position,
    type: "decoration",
  };
}

/**
 * 機能のある家具の前に敷くマット。立つ場所の目印にする（町の建物の前の道と同じ役目）。
 * 家具の正面（entranceOffset の向き）の、当たり判定のすぐ外に敷く。
 * @param building - 機能のある家具
 * @returns マットのオブジェクト
 */
function matObject(building: BuildingMapObject): DecorationMapObject {
  const direction = Math.sign(building.entranceOffset.z) || 1;
  return {
    collidable: false,
    // 「扉の前に道がある」ことを確かめるテスト（tests/rpgHub.test.mjs）が目印として探す接頭辞
    id: `mat-${building.id}`,
    interactive: false,
    model: RPG_HUB_ASSETS.houseMat,
    position: {
      x: building.position.x,
      y: 0,
      z: building.position.z + direction * (building.collisionSize.depth / 2 + 0.5),
    },
    type: "decoration",
  };
}

/**
 * 部屋（床・壁・玄関・家具・マット）を作る。
 *
 * 壁は奥（-Z）と左（-X）だけ。我が家タウンのカメラは手前右の上から見下ろしているので、
 * 手前（+Z）と右（+X）は床だけにして、見えない壁で床の外へ出ないようにする。
 * 手前の見えない壁の真ん中は切れていて、そこから玄関（土間）が手前へ飛び出す。玄関の先の端が出口で、
 * 部屋の内側（-Z）を向ける。
 * @returns 部屋のオブジェクト
 */
function createRoomObjects(): MapObject[] {
  const wallThickness = HOUSE_ROOM_SIZE.wallThickness;
  const backWallZ = BACK_Z - wallThickness / 2;

  const door = furnitureObject(
    "house-door",
    "door",
    { x: HOUSE_ROOM_CENTER.x, y: 0, z: ENTRANCE_END_Z + wallThickness / 2 },
    "exit",
    { x: 0, y: 0, z: -HOUSE_FURNITURE_SHAPES.door.depth / 2 },
  );
  const backFurniture = BACK_WALL_FURNITURE.map((placement) => {
    const depth = HOUSE_FURNITURE_SHAPES[placement.kind].depth;
    return furnitureObject(
      placement.id,
      placement.kind,
      { x: HOUSE_ROOM_CENTER.x + placement.x, y: 0, z: BACK_Z + WALL_GAP + depth / 2 },
      placement.route,
      { x: 0, y: 0, z: depth / 2 },
    );
  });
  const furniture = [door, ...backFurniture];
  const mats = furniture
    .filter((object): object is BuildingMapObject => object.type === "building")
    .map(matObject);

  return [
    {
      collidable: false,
      id: "house-floor",
      interactive: false,
      model: RPG_HUB_ASSETS.houseFloor,
      position: { x: HOUSE_ROOM_CENTER.x, y: 0, z: HOUSE_ROOM_CENTER.z },
      type: "decoration",
    },
    ...wallLine("house-wall-back", "x", backWallZ, LEFT_X, RIGHT_X),
    ...wallLine("house-wall-left", "z", LEFT_X - wallThickness / 2, BACK_Z, FRONT_Z),
    // 手前と右は見えない壁。手前は真ん中（玄関の横幅ぶん）を空けて左右に分ける
    invisibleWall("house-wall-front-left", LEFT_X, ENTRANCE_LEFT_X, FRONT_Z, FRONT_Z + wallThickness),
    invisibleWall("house-wall-front-right", ENTRANCE_RIGHT_X, RIGHT_X, FRONT_Z, FRONT_Z + wallThickness),
    invisibleWall("house-wall-right", RIGHT_X, RIGHT_X + wallThickness, BACK_Z, FRONT_Z + wallThickness),
    // 玄関（土間）の床と、その左右の見えない壁。先の端は出口（door）がふさぐ
    {
      collidable: false,
      id: "house-entrance-floor",
      interactive: false,
      model: RPG_HUB_ASSETS.houseEntranceFloor,
      position: { x: HOUSE_ROOM_CENTER.x, y: 0, z: (ENTRANCE_START_Z + ENTRANCE_END_Z) / 2 },
      type: "decoration",
    },
    invisibleWall(
      "house-wall-entrance-left",
      ENTRANCE_LEFT_X - wallThickness,
      ENTRANCE_LEFT_X,
      ENTRANCE_START_Z,
      ENTRANCE_END_Z,
    ),
    invisibleWall(
      "house-wall-entrance-right",
      ENTRANCE_RIGHT_X,
      ENTRANCE_RIGHT_X + wallThickness,
      ENTRANCE_START_Z,
      ENTRANCE_END_Z,
    ),
    ...furniture,
    ...mats,
  ];
}

/** 家の中のオブジェクト。マップ（mapObjects.ts の `INITIAL_MAP_OBJECTS`）に足す */
export const HOUSE_INTERIOR_OBJECTS: readonly MapObject[] = createRoomObjects();

/**
 * 家の中の壁の外周（判定範囲）。`getHouseLocation` が使うのと同じ四角で、
 * テスト側（`tests/rpgHub.test.mjs`）が「区画の四隅がDBの座標範囲に収まること」を
 * 確認できるよう公開する。
 */
export const HOUSE_ZONE_BOUNDS = {
  maxX: RIGHT_X + HOUSE_ROOM_SIZE.wallThickness,
  // 手前へ飛び出した玄関（土間）の、出口の外側まで
  maxZ: ENTRANCE_END_Z + HOUSE_ROOM_SIZE.wallThickness,
  minX: LEFT_X - HOUSE_ROOM_SIZE.wallThickness,
  minZ: BACK_Z - HOUSE_ROOM_SIZE.wallThickness,
} as const;

/**
 * 部屋の床の上か（手前へ飛び出した玄関は含めない）。「かざる」で装飾を置ける範囲（Issue #444）。
 *
 * 手前と右は見えない壁しかないので、壁の向こう（床の無い所）でも何とも重ならない。
 * 床の外に置けると、装飾が宙に浮いて見えるうえ、家の区画からも外れて町の物として扱われる。
 * @param x - X座標
 * @param z - Z座標
 * @returns 床の上なら true
 */
export function isOnHouseFloor(x: number, z: number): boolean {
  return x >= LEFT_X && x <= RIGHT_X && z >= BACK_Z && z <= FRONT_Z;
}

/** いる場所。町か、家の中か */
export type HouseLocation = "house" | "town";

/**
 * 家の中にいるかを、プレイヤーの実座標から判定する。
 *
 * 別のstateに持つと、WebViewの再読み込みや画面の作り直され方によっては実際のプレイヤー位置と
 * ずれ、家の中にいるのに「町」表示のままで家から出られなくなる不具合があった（Issue #235）。
 * プレイヤー位置から毎回導出することで、常に実位置と一致させる。
 * @param x - プレイヤーのX座標
 * @param z - プレイヤーのZ座標
 * @returns "town"（町）/ "house"（家の中）
 */
export function getHouseLocation(x: number, z: number): HouseLocation {
  const bounds = HOUSE_ZONE_BOUNDS;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ ? "house" : "town";
}
