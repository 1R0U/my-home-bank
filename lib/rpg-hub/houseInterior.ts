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

import type { AssetId, BuildingMapObject, DecorationMapObject, MapObject, MapRouteId, Vector3 } from "../../types/map";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { HOUSE_FLOOR_OBJECT_ID, STARTER_HOUSE_FINISHES } from "./houseFinishes.ts";
import {
  getFurnitureWidth,
  HOUSE_ENTRANCE_SIZE,
  HOUSE_FURNITURE_SHAPES,
  HOUSE_CELL_SIZE,
  HOUSE_ROOM_SIZE,
  HOUSE_WALL_TILE_LENGTH,
  type HouseFurnitureKind,
} from "./houseInteriorParts.ts";

/**
 * 部屋の床の奥・左（南西）の角。家の中のマス(0, 0)の角でもある（`HOUSE_GRID_ORIGIN`）。
 *
 * **部屋の大きさを変えても、この角は動かさない**（Issue #477 で 12 × 8 から 14 × 9 マスにしたときも
 * そのままにした）。動かすとマスの境目がずれ、もう置いてある装飾がマスの真ん中から外れる。
 */
const HOUSE_ROOM_CORNER = { x: -6, z: -80 } as const;

/**
 * 部屋の中心座標（14 × 9 マスの床の真ん中。x = 0.3, z = -75.95）。
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
export const HOUSE_ROOM_CENTER = {
  x: HOUSE_ROOM_CORNER.x + HOUSE_ROOM_SIZE.width / 2,
  z: HOUSE_ROOM_CORNER.z + HOUSE_ROOM_SIZE.depth / 2,
} as const;

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
  /**
   * かざるの編集モードで動かせる家具か（Issue #477。houseFurniture.ts の `MOVABLE_FURNITURE_IDS`）。
   * 動かせる家具は、最初の位置もマスにそろえる（奥の壁ぎわの行の真ん中。x もマスの境目にする）。
   * そろえておかないと、少し持ち上げて同じ場所へ下ろしただけで位置が変わる。
   */
  movable?: true;
  /** 機能のある家具だけが持つ。持たない家具は飾り */
  route?: MapRouteId;
  x: number;
};

const BACK_WALL_FURNITURE: readonly FurniturePlacement[] = [
  // 横2マスの家具なので、中心はマスの境目（床の左の角から3マス目と4マス目の間）に置く
  { id: "house-closet", kind: "closet", movable: true, route: "wardrobe", x: -3.6 },
  { id: "house-window", kind: "window", x: 0.6 },
  // ソファ・植木も動かせる（Issue #506）。ソファは横2マスなので中心をマスの境目（左の角から9マス目と10マス目の間）、
  // 植木は1マスなのでマスの真ん中（左の角から11マス目）に置く
  { id: "house-sofa", kind: "sofa", movable: true, x: 0.9 },
  { id: "house-plant", kind: "plant", movable: true, x: 3.15 },
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

// 床の縁は角から直接求める。中心から半分ずつ足し引きすると、小数の誤差で縁がマスの境目から
// わずかにずれ（8.1 が 8.0999… になる）、端のマスが床の外と判定されることがある
const BACK_Z = HOUSE_ROOM_CORNER.z;
const FRONT_Z = HOUSE_ROOM_CORNER.z + HOUSE_ROOM_SIZE.depth;
const LEFT_X = HOUSE_ROOM_CORNER.x;
const RIGHT_X = HOUSE_ROOM_CORNER.x + HOUSE_ROOM_SIZE.width;

/** 床の縁の判定に持たせる余裕。マスの縁と床の縁がちょうど重なるとき、小数の誤差で外にしない */
const FLOOR_EPSILON = 1e-6;

/**
 * 家の中のマス(0, 0)の南西の角（Issue #445）。部屋の床の南西の角（`HOUSE_ROOM_CORNER`。x = -6, z = -80）にそろえる。
 *
 * 町のマス（原点が出発地点）をそのまま使うと、床の奥の端 z = -80 が 0.9 の倍数でないため
 * マスの境目に来ず、奥の壁ぎわのマスは必ず床から0.1はみ出して、何も置けなくなる。
 */
export const HOUSE_GRID_ORIGIN = { x: LEFT_X, z: BACK_Z } as const;

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
      // 選んだ壁紙は mapStore が重ねる（houseFinishes.ts の applyHouseFinishes）
      model: STARTER_HOUSE_FINISHES.wallpaperId as AssetId,
      position: axis === "x" ? { x: along, y: 0, z: fixed } : { x: fixed, y: 0, z: along },
      rotationY: axis === "x" ? 0 : SIDE_WALL_ROTATION,
      type: "decoration",
    };
  });
}

/**
 * 壁の切れ目（四隅）をふさぐ柱を1本置く。当たり判定は隣の壁が持つ。
 * @param id - オブジェクトID
 * @param x - 柱の中心のX座標
 * @param z - 柱の中心のZ座標
 * @returns 柱のオブジェクト
 */
function postObject(id: string, x: number, z: number): DecorationMapObject {
  return {
    collidable: false,
    id,
    interactive: false,
    model: RPG_HUB_ASSETS.housePost,
    position: { x, y: 0, z },
    type: "decoration",
  };
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
    // 動かせる家具は、奥の壁ぎわの行（マス(?, 0)）の真ん中に置く
    const z = placement.movable ? BACK_Z + HOUSE_CELL_SIZE / 2 : BACK_Z + WALL_GAP + depth / 2;
    return furnitureObject(
      placement.id,
      placement.kind,
      { x: HOUSE_ROOM_CENTER.x + placement.x, y: 0, z },
      placement.route,
      { x: 0, y: 0, z: depth / 2 },
    );
  });
  const furniture = [door, ...backFurniture];
  // 動かせる家具のマットは家具の形の一部なので、別には敷かない（Issue #477。houseInteriorParts.ts の frontMatParts）
  const movableIds = new Set(BACK_WALL_FURNITURE.filter((placement) => placement.movable).map((placement) => placement.id));
  const mats = furniture
    .filter((object): object is BuildingMapObject => object.type === "building" && !movableIds.has(object.id))
    .map(matObject);

  return [
    {
      collidable: false,
      id: HOUSE_FLOOR_OBJECT_ID,
      interactive: false,
      // 選んだ床板は mapStore が重ねる（houseFinishes.ts の applyHouseFinishes）
      model: STARTER_HOUSE_FINISHES.flooringId as AssetId,
      position: { x: HOUSE_ROOM_CENTER.x, y: 0, z: HOUSE_ROOM_CENTER.z },
      type: "decoration",
    },
    // 高い壁（奥・左）の端の柱。手前右の角は壁が無いので柱も置かない
    postObject("house-post-back-left", LEFT_X - wallThickness / 2, BACK_Z - wallThickness / 2),
    postObject("house-post-back-right", RIGHT_X + wallThickness / 2, BACK_Z - wallThickness / 2),
    postObject("house-post-front-left", LEFT_X - wallThickness / 2, FRONT_Z + wallThickness / 2),
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
 * 大きさを渡すと、中心だけでなく四角全体が床の内側にあるかを調べる（中心が床の縁ぎりぎりだと、
 * 大きい装飾の半分が床の外へはみ出すため。1R0Uさんレビュー指摘）。
 * @param x - 中心のX座標
 * @param z - 中心のZ座標
 * @param halfWidth - X方向の半分の幅。省略時は中心の1点で調べる
 * @param halfDepth - Z方向の半分の奥行き。省略時は中心の1点で調べる
 * @returns 床の上なら true
 */
export function isOnHouseFloor(x: number, z: number, halfWidth = 0, halfDepth = 0): boolean {
  return (
    x - halfWidth >= LEFT_X - FLOOR_EPSILON &&
    x + halfWidth <= RIGHT_X + FLOOR_EPSILON &&
    z - halfDepth >= BACK_Z - FLOOR_EPSILON &&
    z + halfDepth <= FRONT_Z + FLOOR_EPSILON
  );
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
