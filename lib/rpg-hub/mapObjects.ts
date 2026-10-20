import type {
  AssetId,
  BuildingMapObject,
  DecorationMapObject,
  EquipmentSlot,
  MapObject,
  MapRouteId,
  NpcMapObject,
  Vector3,
} from "../../types/map";
import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import { RPG_HUB_ASSETS, resolveAssetId } from "./assets.ts";
import { parsePalette } from "./palette.ts";
import { createRandom } from "./random.ts";
import {
  ASSET_CATALOG,
  getDecorationPlacement,
  getSlotAnchor,
  getWearableAnchorPoint,
  getWearableSlot,
  groundedY,
  type AssetDefinition,
  type DecorationPlacement,
} from "./catalog.ts";
import {
  CHARACTER_TYPE_ASSET_IDS,
  getCharacterCenterY,
  getCharacterCollisionSide,
  type CharacterType,
} from "./characterTypes.ts";
import { getHouseLocation, HOUSE_INTERIOR_OBJECTS, type HouseLocation } from "./houseInterior.ts";
import { PLAYER_SCALE } from "./movement.ts";
import {
  BUILDING_LOT_CELLS,
  cellKeys,
  collectBlockedCells,
  expandCellRange,
  getBlockedCells,
  getCellsCenter,
  getDecorationCenter,
  getDecorationMaxScale,
  getLotBuildingPosition,
  getObjectCells,
  isCellRangeFree,
  QUARTER_TURN,
  snapDecorationToCells,
  snapRotationToQuarter,
  type TownCell,
} from "./townGrid.ts";
import { BEACH_DEPTH, SHORE_Z, WORLD_HALF } from "./worldBounds.ts";

export { getHouseLocation, HOUSE_ZONE_BOUNDS, type HouseLocation } from "./houseInterior.ts";

/** 許可されたマップルートIDのセット（検証用） */
const MAP_ROUTE_IDS = new Set<MapRouteId>([
  "bank",
  "board",
  "exit",
  "history",
  "house",
  "store",
  "tasks",
  "wardrobe",
]);

/**
 * 建物の拡大率。見た目・当たり判定・入口の位置すべてに掛かる。
 * 4棟とも、パーツの底面がローカル座標の y = -1.2 に揃うように作られているため、
 * 拡大したぶんだけ position.y も上げないと建物が地面へ沈む（y = 1.2 * BUILDING_SCALE）。
 *
 * 1.4 では住人（高さ約1.5）やプレイヤー（約1.0）と並べたときに建物が大きすぎたため
 * 1.1 へ下げた（Issue #214）。扉の前に立つ位置は、当たり判定の手前の面から
 * `getLotBuildingPosition` が求めるので、拡大率を変えても道から外れない（Issue #445）。
 *
 * **当たり判定（幅3.4）が区画（4マス = 3.6）に収まる大きさにする**（Issue #445）。1.1 では 3.74 になり、
 * 隣のマスに置いた装飾が壁にめり込んだ。1.05 で 3.57。テスト（tests/rpgHub.test.mjs）で押さえてある。
 */
export const BUILDING_SCALE = 1.05;

/** 拡大した建物の原点の高さ。底面を地面に合わせる。 */
export const BUILDING_Y = 1.2 * BUILDING_SCALE;

/**
 * 掲示板（BULLETIN_BOARD_PARTS）の原点の高さ。底面を地面に合わせる（Issue #354）。
 * 4棟の建物とは違い等身大の物なので、BUILDING_SCALE は掛けない。
 */
const BULLETIN_BOARD_Y = 0.9;

/**
 * 指定した区画（`getHouseLocation` と同じ判定）に属するオブジェクトだけを残す（1R0Uさんレビュー指摘）。
 *
 * **「かざる」の置ける判定（`canPlaceDecoration`）は、いま居る区画の建物・障害物だけを
 * 見れば足りる。** 家の中の玄関・クローゼットは壁で閉じられ、町からは絶対に行き来できないが、
 * これらも `type: "building"` として一緒に渡すと、到達判定の対象（＝到達できるはずの建物数）が
 * 実際より増えてしまい、「置いたあとに全建物へ行けるか」の早期終了が町ではいつも成り立たず、
 * 毎回2回（置く前・置いた後）塗りつぶすことになる。調べる範囲（`getSearchBounds`）も
 * 他区画の座標まで含めて広がるため、判定が余分に重くなる。
 * @param objects - マップオブジェクト一覧
 * @param location - 残す区画（`getHouseLocation` の戻り値）
 * @returns その区画に属するオブジェクトだけの配列
 */
export function filterObjectsByLocation(
  objects: readonly MapObject[],
  location: HouseLocation,
): MapObject[] {
  return objects.filter((object) => getHouseLocation(object.position.x, object.position.z) === location);
}

/**
 * 装飾として置けるアセットと、その寸法。
 *
 * **中身は lib/rpg-hub/catalog.ts の `placement` から導出している。**
 * 以前はここに大きさの表を手で持っており、アセットを1つ増やすたびに
 * カタログ側とこちらの両方へ足す必要があった（Issue #220）。
 */
const DECORATION_SPECS = Object.fromEntries(
  // 引数で分割代入しない（esbuild が ios13 ターゲットへ変換できない）。
  // ここは今のところバンドルから落ちているが、scene.ts から辿られた時点で
  // `npm run build:scene` が落ちるため、はじめから避けておく。
  (Object.entries(ASSET_CATALOG) as [string, AssetDefinition][])
    .filter((entry) => entry[1].placement !== undefined)
    .map((entry) => [entry[0], { ...entry[1].placement, model: entry[1].id as AssetId }]),
) as {
  [K in DecorationKey]: DecorationPlacement & { model: AssetId };
};

/** 装飾として置けるアセットの見出し（カタログで `placement` を持つもの）。 */
type DecorationKey = {
  [K in keyof typeof ASSET_CATALOG]: (typeof ASSET_CATALOG)[K] extends { placement: unknown }
    ? K
    : never;
}[keyof typeof ASSET_CATALOG];

/** 装飾物の種類。 */
type DecorationKind = DecorationKey;

/**
 * 自然物の種類ごとの見た目のパターン。散らすときはここからランダムに選ぶ。
 * 同じ形だけを並べると、いくら散らしても模様のように見えるため。
 */
const NATURE_VARIANTS: readonly (readonly DecorationKind[])[] = [
  ["tree", "treePine", "treeTall", "treeYoung"],
  ["bush", "bushBerry", "bushTall", "bushWide"],
  ["rock", "rockFlat", "rockPile", "rockTall"],
  ["grass", "grassFlower", "grassTall", "grassWide"],
];

/**
 * 装飾物の拡大率を、見た目も当たり判定もマスからはみ出さない大きさまでに抑える。
 * @param spec - 装飾物の寸法
 * @param scale - 指定した拡大率
 * @returns 抑えたあとの拡大率
 */
const fitScaleToCells = (spec: DecorationPlacement & { model: AssetId }, scale: number): number =>
  Math.min(scale, getDecorationMaxScale(spec.model) ?? scale);

/**
 * 装飾物を作る。位置は中心の座標で渡す（マスへ寄せるのは呼ぶ側）。
 * @param kind - 装飾物の種類
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @param scale - 拡大率
 * @param rotationY - Y軸まわりの回転（ラジアン）
 * @returns 装飾オブジェクト
 */
const decorationAt = (
  kind: DecorationKind,
  id: string,
  x: number,
  z: number,
  scale: number,
  rotationY: number,
): DecorationMapObject => {
  const spec = DECORATION_SPECS[kind];
  const solid = (spec as { solid?: false }).solid !== false;
  return {
    collidable: solid,
    // 当たり判定を持たないものには大きさを持たせない（movement.ts が判定対象から外す）
    ...(solid ? { collisionSize: { depth: spec.size, width: spec.size } } : {}),
    id,
    interactive: false,
    model: spec.model,
    position: { x, y: groundedY(spec.halfHeight, scale), z },
    rotationY,
    scale,
    type: "decoration",
  };
};

/**
 * マスに装飾物を置く（Issue #445）。
 *
 * 1つのマスには1つしか置かない（しげみ・岩・木・花壇は 2×2 マス）。向きは90度刻み、拡大率は
 * 見た目も当たり判定もマスからはみ出さない大きさまでにする。どちらも、隣のマスの物と
 * 当たり判定が重ならないようにするため。
 * @param kind - 装飾物の種類
 * @param id - オブジェクトID
 * @param cell - 置くマス（2×2 マスの物は南西のマス）
 * @param scale - 拡大率。同じ形が並んで見えないよう1つずつ変える
 * @param turns - 向き（90度を何回まわすか）
 * @returns 装飾オブジェクト
 */
const decoration = (
  kind: DecorationKind,
  id: string,
  cell: TownCell,
  scale = 1,
  turns = 0,
): DecorationMapObject => {
  const spec = DECORATION_SPECS[kind];
  const center = getDecorationCenter(spec.model, cell) as { x: number; z: number };
  return decorationAt(kind, id, center.x, center.z, fitScaleToCells(spec, scale), snapRotationToQuarter(turns * QUARTER_TURN));
};

/**
 * 道のタイルを1枚作る。
 * 道は**当たり判定を持たせない**。歩く場所を示すためのもので、塞ぐためのものではない。
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @returns 装飾オブジェクト
 */
export const pathTile = (id: string, x: number, z: number): DecorationMapObject => ({
  collidable: false,
  id,
  interactive: false,
  model: RPG_HUB_ASSETS.path,
  // 板の厚みは0.06。地面（y = -0.08）より上に出しつつ、段差に見えない高さに置く。
  position: { x, y: -0.03, z },
  type: "decoration",
});

/**
 * NPCを作る。
 *
 * 町の住人は VILLAGER_PARTS 共通の形で、`palette` の色だけを1体ずつ変える。
 * 家族は `characterType` を渡し、その人が選んだ種類の形で立たせる（Issue #473。
 * lib/rpg-hub/familyNpcs.ts が、取得した家族から組み立てる）。プレイヤーとして見ている姿と
 * 同じにしないと、誰が誰なのか分からないため。
 *
 * 家族の人を出すときは `familyMemberId`（users.id）も渡す（Issue #255）。町の住人は持たない。
 *
 * **向き（rotationY）は 0 前後にする。** カメラはプレイヤーの +X+Z 側から見下ろしているため
 * （lib/rpg-hub/townCamera.ts の TOWN_CAMERA_OFFSET）、画面に映るのは +X 面と +Z 面。住人の顔は +Z 向きに作って
 * あるので、半回転させると後頭部しか見えなくなる。建物の扉が +Z を向いているのと同じ理由。
 *
 * @param options - NPCの設定
 * @returns NPCオブジェクト
 */
export const createNpc = (options: {
  /** 選べるキャラクターの形で立たせるときの種類。省略すると住人の形 */
  characterType?: CharacterType;
  dialogueId: string;
  familyMemberId?: string;
  id: string;
  name: string;
  palette: NpcMapObject["palette"];
  rotationY?: number;
  x: number;
  z: number;
}): NpcMapObject => ({
  collidable: true,
  dialogueId: options.dialogueId,
  ...(options.familyMemberId === undefined ? {} : { familyMemberId: options.familyMemberId }),
  id: options.id,
  interactionRadius: 2.2,
  interactive: true,
  name: options.name,
  palette: options.palette,
  rotationY: options.rotationY ?? 0,
  type: "npc",
  ...(options.characterType === undefined
    ? {
        // 人1人ぶん。すり抜けられると、その場にいる感じが出ない
        collisionSize: { depth: 0.7, width: 0.7 },
        model: RPG_HUB_ASSETS.villager,
        // 足の底(-0.71)を地面へ合わせる
        position: { x: options.x, y: 0.66, z: options.z },
      }
    : createCharacterNpcLook(options.characterType, options.x, options.z)),
});

/**
 * 選べるキャラクターの形で立つNPCの、形・大きさ・高さ・当たり判定。
 *
 * **大きさはプレイヤーと同じ `PLAYER_SCALE` 倍にする。** 同じ種類なら、プレイヤーと並んでも
 * 同じ大きさに見えるように。高さもプレイヤーと同じ式で、足元を地面へ合わせる。
 *
 * 当たり判定は見た目の広がりに合わせる（`getCharacterCollisionSide`）。当たり判定には
 * `scale` が掛かるので（movement.ts の getCollisionHalfExtents）、拡大率1の大きさを入れる。
 * @param characterType - キャラクターの種類
 * @param x - X座標
 * @param z - Z座標
 * @returns NPCのうち、形にかかわる値
 */
function createCharacterNpcLook(
  characterType: CharacterType,
  x: number,
  z: number,
): Pick<NpcMapObject, "collisionSize" | "model" | "position" | "scale"> {
  const side = getCharacterCollisionSide(characterType);
  return {
    collisionSize: { depth: side, width: side },
    model: CHARACTER_TYPE_ASSET_IDS[characterType],
    position: { x, y: getCharacterCenterY(characterType, PLAYER_SCALE), z },
    scale: PLAYER_SCALE,
  };
}

/**
 * 道のタイル1枚が占めるマスの数（一辺）。カタログの `path` から引く。
 * 直接書くと、タイルの大きさを変えたときに隙間や重なりが出る。
 */
const PATH_CELLS = ASSET_CATALOG.path.placement.cells;

/**
 * 道のタイルを1枚敷く。
 * @param id - オブジェクトID
 * @param cell - 敷く 2×2 マスの南西のマス
 * @returns 装飾オブジェクト
 */
const pathTileAt = (id: string, cell: TownCell): DecorationMapObject => {
  const { x, z } = getCellsCenter(cell, PATH_CELLS);
  // 占めるマスを持たせる。道の上には装飾を置かない（townGrid.ts の getObjectCells）
  return { ...pathTile(id, x, z), footprint: { cells: PATH_CELLS, col: cell.col, row: cell.row } };
};

/**
 * 道を一直線に敷く。タイル1枚ぶん（2マス）ずつずらすので、隙間なく並ぶ。
 * @param idPrefix - 各タイルのIDの接頭辞
 * @param axis - 道が伸びる向き（"x" は東へ、"z" は北へ）
 * @param from - 端（西端または南端）のタイルの南西のマス
 * @param count - タイルの枚数
 * @returns 装飾オブジェクトの配列
 */
export const pathLine = (
  idPrefix: string,
  axis: "x" | "z",
  from: TownCell,
  count: number,
): DecorationMapObject[] =>
  Array.from({ length: count }, (_, index) =>
    pathTileAt(
      `${idPrefix}-${index}`,
      axis === "x"
        ? { col: from.col + index * PATH_CELLS, row: from.row }
        : { col: from.col, row: from.row + index * PATH_CELLS },
    ),
  );

/** 道をタイル1枚ずつ伸ばす向き。+Z が北。 */
type PathStep = "east" | "north" | "south" | "west";

/**
 * タイル1枚ずつ向きを指定して道を敷く。
 *
 * `pathLine` は真っ直ぐにしか伸ばせないため、町の外へ曲がりながら延びる道に使う。
 * 町なかは「工」の形にきちんと敷いてあるが、外の道はわざと折れ曲がらせて、
 * 地面が均一に見えないようにしている。
 * @param idPrefix - 各タイルのIDの接頭辞
 * @param from - 1枚目のタイルの南西のマス
 * @param steps - 2枚目以降を置く向き
 * @returns 装飾オブジェクトの配列
 */
const pathTrail = (
  idPrefix: string,
  from: TownCell,
  steps: readonly PathStep[],
): DecorationMapObject[] => {
  let { col, row } = from;
  const tiles = [pathTileAt(`${idPrefix}-0`, { col, row })];

  steps.forEach((step, index) => {
    if (step === "east") col += PATH_CELLS;
    else if (step === "west") col -= PATH_CELLS;
    else if (step === "north") row += PATH_CELLS;
    else row -= PATH_CELLS;
    tiles.push(pathTileAt(`${idPrefix}-${index + 1}`, { col, row }));
  });
  return tiles;
};

/** 自然物を散らす範囲（中心からの距離）。 */
const SCATTER_HALF = 34;

/** 手で置いてある町の範囲。ここには散らさない。 */
const TOWN_HALF = { x: 13, z: 15 };

/**
 * 散らす物のまわりに空けるマスの数。物どうしがくっついて並ぶと、木の葉が重なって見えるため、
 * 「占めるマスのまわり1マスも空いていること」を条件にする（Issue #445）。
 */
const SCATTER_MARGIN_CELLS = 1;

/** 種類ごとに散らす数。NATURE_VARIANTS と同じ並び（木・低木・岩・草むら）。 */
const SCATTER_COUNTS = [62, 46, 34, 58];

/**
 * 町の外へ自然物を散らす。
 *
 * 手で200個置くのは現実的でないため、決まった種の擬似乱数で位置・形・大きさ・向きを
 * 決める。**置く前に必ず、占めるマスとそのまわりが空いているかを見て、埋まっている位置は捨てる**
 * （townGrid.ts の決まり）。これで「建物にめり込む」「道の上に立つ」「同じマスに重なる」が起きない
 * （テストでも押さえてある）。
 *
 * @param base - すでに置いてあるもの（建物・道・町なかの装飾・NPC）
 * @returns 散らした装飾オブジェクト
 */
const scatterNature = (base: readonly MapObject[]): DecorationMapObject[] => {
  const random = createRandom(20260916);
  const scattered: DecorationMapObject[] = [];
  // 置けないマス（建物の区画・扉の前・道・町なかの装飾・NPC）。置いた物のマスも足していく
  const blocked = collectBlockedCells(base);

  NATURE_VARIANTS.forEach((variants, kindIndex) => {
    let remaining = SCATTER_COUNTS[kindIndex];
    // 置ける場所が見つからないまま回り続けないよう、試行回数に上限を置く
    let attempts = remaining * 60;

    while (remaining > 0 && attempts > 0) {
      attempts -= 1;
      const rawX = (random() * 2 - 1) * SCATTER_HALF;
      const rawZ = (random() * 2 - 1) * SCATTER_HALF;
      if (Math.abs(rawX) < TOWN_HALF.x && Math.abs(rawZ) < TOWN_HALF.z) continue;

      const kind = variants[Math.floor(random() * variants.length)];
      const spec = DECORATION_SPECS[kind];
      // 散らす物もマスに置く（Issue #445）。乱数の引き方は変えず、引いた値をマスへ寄せる
      const { x, z } = snapDecorationToCells(spec.model, rawX, rawZ) as { x: number; z: number };
      // 寄せた先が町なかに入ったり、散らす範囲の外へ出たりすることがあるので、もう一度見る
      if (Math.abs(x) < TOWN_HALF.x && Math.abs(z) < TOWN_HALF.z) continue;
      if (Math.abs(x) > SCATTER_HALF || Math.abs(z) > SCATTER_HALF) continue;
      const scale = fitScaleToCells(spec, 0.8 + random() * 0.5);
      // マスに置く物は90度刻みにして、1マスからはみ出さないようにする
      const rotationY = snapRotationToQuarter(random() * Math.PI * 2);
      const object = decorationAt(kind, `scatter-${kindIndex}-${remaining}`, x, z, scale, rotationY);
      // 占めるマスとそのまわりが空いているときだけ置く（townGrid.ts の決まり）
      const cells = getObjectCells(object);
      if (!cells || !isCellRangeFree(expandCellRange(cells, SCATTER_MARGIN_CELLS), blocked)) continue;

      scattered.push(object);
      for (const range of getBlockedCells(object)) {
        for (const key of cellKeys(range)) blocked.add(key);
      }
      remaining -= 1;
    }
  });

  return scattered;
};

/**
 * 建物を区画（`BUILDING_LOT_CELLS` = 4×4マス）に置く。中心の座標は区画と当たり判定の大きさから求める
 * （`getLotBuildingPosition`）。座標を直書きしないのは、扉の前に道が来るよう
 * 建物ごとに手で合わせなくて済むようにするため（Issue #445）。
 * 占めるマス（`footprint`）として区画を持たせる。扉の前の1行も置けないマスになる（townGrid.ts の getBlockedCells）。
 * @param lot - 区画の南西のマス
 * @param building - 位置（position）以外の建物の設定
 * @param y - 原点の高さ。底面を地面に合わせる
 * @returns 建物オブジェクト
 */
export const lotBuilding = (
  lot: TownCell,
  building: Omit<BuildingMapObject, "position">,
  y: number,
): BuildingMapObject => {
  const halfDepth = (building.collisionSize.depth * (building.scale ?? 1)) / 2;
  const { x, z } = getLotBuildingPosition(lot, halfDepth);
  return { ...building, footprint: { cells: BUILDING_LOT_CELLS, col: lot.col, row: lot.row }, position: { x, y, z } };
};

/**
 * 建物の区画（南西のマス）。テストからも、建物がどのマスにあるかを見るために使う。
 *
 * 4棟は中央の道（列-1〜0）から東西へ2マス空けた四隅に置く。扉はすべて +Z を向いているので、
 * 区画のすぐ北の行（`doorRow`）に道を敷く。南の2棟（行-7〜-4）は行-3、北の2棟（行5〜8）は行9。
 */
export const TOWN_BUILDING_LOTS = {
  "bank-building": { col: 5, row: -7 },
  // 南の道の、中央の道との角の西側。クエストの建物とのあいだは空けない（掲示板は幅が狭いため）
  "bulletin-board": { col: -5, row: -7 },
  "history-building": { col: -9, row: 5 },
  // path-out-south の突き当たり（`doorRow` で行-13）の南
  "house-building": { col: -5, row: -17 },
  "store-building": { col: 5, row: 5 },
  "tasks-building": { col: -9, row: -7 },
} as const satisfies Record<string, TownCell>;

/**
 * 区画のすぐ北の行（扉の前）。道はこの行に敷く。
 * @param lot - 区画の南西のマス
 * @returns 扉の前の行
 */
export const doorRow = (lot: TownCell): number => lot.row + BUILDING_LOT_CELLS;

/**
 * RPGハブの初期マップオブジェクト（建物、装飾など）。
 *
 * 建物は中央から見た四隅に置き、中央と建物の裏を通れるようにしている。
 * 建物と道の位置はマス（townGrid.ts）の番号で決める。
 *
 * 道は「工」の形に敷いてある。4棟の扉はすべて +Z を向いているため、
 * クエストと銀行の前を通る南の道（南の2棟の `doorRow`）、ストアと履歴の前を通る北の道（北の2棟の `doorRow`）、
 * その2本をつなぐ中央の道（列-1〜0）の3本で、どの建物へも道なりに着く。
 * 出発地点(0, 0)は中央の道の上にある。
 *
 * 装飾物は道の上に置かない。街灯と花壇は道沿い、低木と木と岩は外側へ散らして、
 * 進む方向の目印になるようにしている。町の境界（柵・森・海）は `createWorldBorder` が作る。
 */
const TOWN_MAP_OBJECTS: MapObject[] = [
  lotBuilding(
    TOWN_BUILDING_LOTS["tasks-building"],
    {
      collidable: true,
      collisionSize: { depth: 2.8, width: 3.4 },
      // BuildingMesh.tsx の TasksBuilding: 扉(position=[0,-0.33,1.08])に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 1.08 },
      id: "tasks-building",
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.tasks,
      scale: BUILDING_SCALE,
      route: "tasks",
      type: "building",
    },
    BUILDING_Y,
  ),
  lotBuilding(
    TOWN_BUILDING_LOTS["bank-building"],
    {
      collidable: true,
      collisionSize: { depth: 2.8, width: 3.4 },
      // BuildingMesh.tsx の BankBuilding: 扉(position=[0,-0.45,1.08])に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 1.08 },
      id: "bank-building",
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.bank,
      scale: BUILDING_SCALE,
      route: "bank",
      type: "building",
    },
    BUILDING_Y,
  ),
  lotBuilding(
    TOWN_BUILDING_LOTS["store-building"],
    {
      collidable: true,
      collisionSize: { depth: 2.8, width: 3.4 },
      // BuildingMesh.tsx の StoreBuilding: 左右2枚の扉(z=1.03)に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 1.03 },
      id: "store-building",
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.store,
      scale: BUILDING_SCALE,
      route: "store",
      type: "building",
    },
    BUILDING_Y,
  ),
  lotBuilding(
    TOWN_BUILDING_LOTS["history-building"],
    {
      collidable: true,
      collisionSize: { depth: 2.8, width: 3.4 },
      // BuildingMesh.tsx の HistoryBuilding: 扉(position=[0,-0.48,1.05])に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 1.05 },
      id: "history-building",
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.history,
      scale: BUILDING_SCALE,
      route: "history",
      type: "building",
    },
    BUILDING_Y,
  ),
  lotBuilding(
    TOWN_BUILDING_LOTS["house-building"],
    {
      collidable: true,
      collisionSize: { depth: 2.8, width: 3.4 },
      // HOUSE_PARTS の扉(position=[0.4,-0.48,1.03])に合わせた正面オフセット。
      // 他棟にならい x は 0 のまま（店も扉は中心からずれているが entranceOffset.x は 0）
      entranceOffset: { x: 0, y: 0, z: 1.03 },
      id: "house-building",
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.house,
      scale: BUILDING_SCALE,
      route: "house",
      type: "building",
    },
    BUILDING_Y,
  ),
  lotBuilding(
    TOWN_BUILDING_LOTS["bulletin-board"],
    {
      collidable: true,
      collisionSize: { depth: 0.5, width: 1.7 },
      // BULLETIN_BOARD_PARTS の貼り紙（z = 0.1）に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 0.1 },
      id: "bulletin-board",
      // 小さいので、すぐ隣のクエストの建物より狭くする（道を通りすがっただけで「見る」が出ないように）
      interactionRadius: 2.5,
      interactive: true,
      model: RPG_HUB_ASSETS.board,
      // 町の広場の掲示板（Issue #354）。正面は南の道に向けてあり、その上に立つと「見る」が出る。
      // 板は等身大のまま、場所だけ他の建物と同じ区画（4×4マス）を取る（Issue #445）
      route: "board",
      type: "building",
    },
    BULLETIN_BOARD_Y,
  ),

  // --- 道（当たり判定なし） ---
  // 南の道: クエストと銀行の扉の前を東西に通る
  ...pathLine("path-south", "x", { col: -9, row: doorRow(TOWN_BUILDING_LOTS["tasks-building"]) }, 9),
  // 北の道: 履歴とストアの扉の前を東西に通る
  ...pathLine("path-north", "x", { col: -9, row: doorRow(TOWN_BUILDING_LOTS["history-building"]) }, 9),
  // 中央の道（列-1〜0）: 南北の道をつなぐ。出発地点(0, 0)はこの上
  ...pathLine("path-center", "z", { col: -1, row: -1 }, 5),
  // 町の外へ延びる道。4方向とも途中で折れ曲がらせて、行き先がありそうに見せる
  ...pathTrail("path-out-north", { col: -1, row: 11 }, ["north", "north", "east", "east", "north", "north"]),
  // 南は自分の家まで。突き当たり（家の区画の `doorRow`）は、家の扉の前の4マスとも道にする
  ...pathTrail("path-out-south", { col: -1, row: -5 }, ["south", "south", "west", "south", "south", "west"]),
  ...pathTrail("path-out-east", { col: 9, row: -3 }, ["east", "east", "north", "north", "north"]),
  ...pathTrail("path-out-west", { col: -11, row: 9 }, ["west", "west", "south", "south"]),

  // --- 道沿い（街灯と花壇） ---
  decoration("lamp", "lamp-southwest", { col: -4, row: -1 }, 1, 0),
  decoration("lamp", "lamp-southeast", { col: 4, row: -1 }, 1, 0),
  decoration("lamp", "lamp-northwest", { col: -4, row: 8 }, 1, 0),
  decoration("lamp", "lamp-northeast", { col: 3, row: 8 }, 1, 0),
  decoration("lamp", "lamp-center-east", { col: 1, row: 3 }, 1, 0),
  decoration("lamp", "lamp-center-west", { col: -2, row: 6 }, 1, 0),
  decoration("flowerbed", "flowerbed-plaza-east", { col: 2, row: 1 }, 1, 0),
  decoration("flowerbed", "flowerbed-plaza-west", { col: -4, row: 1 }, 1, 0),
  decoration("flowerbed", "flowerbed-store-side", { col: 2, row: 4 }, 0.9, 0),
  decoration("flowerbed", "flowerbed-history-side", { col: -4, row: 4 }, 0.9, 0),

  // --- 低木（道と建物のあいだを埋める） ---
  // 道ぞいの4本は、回転を反映した当たり判定だと道タイルにかかる（かかりかける）ため、
  // まとめて北へ寄せてある（Issue #250）
  decoration("bush", "bush-south-west", { col: -3, row: -1 }, 1, 0),
  decoration("bush", "bush-south-east", { col: 2, row: -1 }, 1.1, 1),
  decoration("bush", "bush-road-west-end", { col: -9, row: -1 }, 0.95, 1),
  decoration("bush", "bush-road-east-end", { col: 8, row: -1 }, 1.05, 1),
  decoration("bush", "bush-north-west-end", { col: -12, row: 7 }, 1, 1),
  decoration("bush", "bush-north-east-end", { col: 10, row: 8 }, 0.9, 2),
  decoration("bush", "bush-north-back-west", { col: -3, row: 12 }, 1.1, 0),
  decoration("bush", "bush-north-back-east", { col: 1, row: 11 }, 0.95, 1),
  decoration("bush", "bush-far-west", { col: -9, row: 3 }, 1.15, 1),
  decoration("bush", "bush-far-east", { col: 8, row: 3 }, 1, 1),

  // --- 木（外側の目印。等間隔に並べない） ---
  decoration("tree", "tree-store-front", { col: 2, row: 6 }, 1, 0),
  decoration("tree", "tree-north", { col: -4, row: 14 }, 1.15, 0),
  decoration("tree", "tree-south", { col: 1, row: -10 }, 0.9, 1),
  decoration("tree", "tree-west", { col: -11, row: 1 }, 1.2, 0),
  decoration("tree", "tree-east", { col: 9, row: 1 }, 0.85, 1),
  decoration("tree", "tree-southeast", { col: 11, row: -10 }, 1.1, 2),
  decoration("tree", "tree-southwest", { col: -12, row: -9 }, 0.95, 0),
  decoration("tree", "tree-tasks-side", { col: -6, row: -10 }, 1.05, 1),
  decoration("tree", "tree-bank-side", { col: 3, row: -8 }, 0.9, 2),
  decoration("tree", "tree-far-north", { col: -9, row: 12 }, 1.2, 0),
  decoration("tree", "tree-far-southeast", { col: 8, row: -13 }, 1, 1),
  decoration("tree", "tree-far-northwest", { col: -17, row: 6 }, 1.1, 1),

  // --- NPC ---
  // 町の住人2人。家族一人ひとりのキャラクターは、取得した家族から
  // lib/rpg-hub/familyNpcs.ts が組み立てて足す（Issue #255）。見た目は palette の色だけで作り分ける。
  createNpc({
    dialogueId: "villager-guide",
    id: "npc-guide",
    name: "あんない人",
    palette: { accent: "#2f855a", hair: "#3f2a1d", skin: "#f3c9a4" },
    // 出発地点のそば、中央の道の脇。顔が見えるよう +Z を向きつつ、道（+X側）へ少し振る。
    // 花壇の当たり判定に重ならない位置にしている（重なると、そこから歩き出せない）。
    // 回転を反映した当たり判定（#198）だと x=-1.1 では花壇へ2cmめり込むため、道側へ寄せた
    rotationY: 0.4,
    x: -1,
    z: 3.6,
  }),
  createNpc({
    dialogueId: "villager-shopkeeper",
    id: "npc-shopkeeper",
    name: "みせばん",
    palette: { accent: "#c2410c", hair: "#1f2937", skin: "#e8b48c" },
    // 北の道のストア側の端、道の北側。道の上に立つと通れなくなるので外す。
    // 顔が見えるよう +Z を向きつつ、ストア（-X側）へ少し振る
    rotationY: -0.35,
    x: 5.4,
    z: 10.7,
  }),

  // --- 草むら（当たり判定なし。地面が単色の平面に見えないようにする） ---
  // 道の上には置かない。歩く場所が分かりにくくなるため
  decoration("grass", "grass-plaza-north", { col: 1, row: 5 }, 1, 0),
  decoration("grass", "grass-plaza-south", { col: -2, row: 2 }, 0.85, 1),
  decoration("grass", "grass-road-south-west", { col: -5, row: -1 }, 1.1, 1),
  decoration("grass", "grass-road-south-east", { col: 5, row: -1 }, 0.9, 2),
  decoration("grass", "grass-road-north-west", { col: -3, row: 8 }, 1.05, 0),
  decoration("grass", "grass-road-north-east", { col: 2, row: 8 }, 0.95, 1),
  decoration("grass", "grass-tasks-side", { col: -5, row: -8 }, 1.15, 2),
  decoration("grass", "grass-bank-side", { col: 3, row: -4 }, 0.9, 0),
  decoration("grass", "grass-west", { col: -11, row: 3 }, 1.1, 1),
  decoration("grass", "grass-east", { col: 8, row: 1 }, 1, 2),
  decoration("grass", "grass-far-north", { col: -4, row: 12 }, 1.2, 1),
  decoration("grass", "grass-far-south", { col: 2, row: -11 }, 1.05, 1),

  // --- 岩（さらに外側） ---
  decoration("rock", "rock-northwest", { col: -11, row: 4 }, 1.1, 0),
  decoration("rock", "rock-northeast", { col: 10, row: 5 }, 0.9, 1),
  decoration("rock", "rock-southwest", { col: -10, row: -11 }, 1.2, 2),
  decoration("rock", "rock-far-north", { col: 9, row: 12 }, 1, 1),
  decoration("rock", "rock-far-west", { col: -13, row: -4 }, 0.95, 1),
  decoration("rock", "rock-far-east", { col: 16, row: -3 }, 1.15, 2),
];

/** 柵1区間の長さ。カタログの `fence` から引く（`PATH_CELLS` と同じ考え方）。 */
const FENCE_SEGMENT_LENGTH = ASSET_CATALOG.fence.placement.size;

/** 柵の外の森の奥行き（柵からどこまで木を植えるか）。奥（西・南）の2辺に使う。 */
const FOREST_DEPTH = 6;

/** 柵の外の茂みの奥行き。手前（東）の1辺に使う。背の高い物はプレイヤーを隠すので低い物だけ。 */
const HEDGE_DEPTH = 3;

/** 森の木を植える升目の一辺。升目ごとに1本、升目の中でずらして植える。 */
const FOREST_CELL = 2.2;

/** 森に植える木。ほとんどをとがった木にして「森」らしく見せ、丸い木を少し混ぜる。 */
const FOREST_TREES: readonly DecorationKind[] = [
  "treePine",
  "treePine",
  "treePine",
  "tree",
  "treeTall",
];

/** 東の柵の外に植える低い茂み。 */
const HEDGE_BUSHES: readonly DecorationKind[] = ["bush", "bushWide", "bushBerry"];

/**
 * 境界の外に置く飾りを作る。**当たり判定は持たせない。**
 *
 * 柵の外へは movement.ts が出さないので、ぶつかる必要がない。当たり判定を持たせると、
 * 「かざる」の判定（placement.ts）が調べる範囲が柵の外まで広がって重くなる。
 * @param kind - 装飾物の種類
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @param scale - 拡大率
 * @param rotationY - Y軸まわりの回転（ラジアン）
 * @returns 当たり判定を持たない装飾オブジェクト
 */
const borderDecoration = (
  kind: DecorationKind,
  id: string,
  x: number,
  z: number,
  scale: number,
  rotationY: number,
): DecorationMapObject => {
  const object = decorationAt(kind, id, x, z, scale, rotationY);
  return {
    collidable: false,
    id: object.id,
    interactive: false,
    model: object.model,
    position: object.position,
    rotationY: object.rotationY,
    scale: object.scale,
    type: "decoration",
  };
};

/**
 * 町の境界（Issue #194）。北（+Z）は海で、残りの3辺を柵で囲み、その外に森と茂みを置く。
 *
 * 位置はすべて worldBounds.ts の `WORLD_HALF` から決める。歩ける範囲の判定（movement.ts）と
 * 同じ値なので、柵の手前で止まり、柵が無い所で止まることはない。
 * 海と砂浜は地面の一部として WebView 側（webview/rpg-hub/scene.ts）が描く。
 *
 * カメラは +X+Z 側から見下ろしているので、奥に映る西・南には背の高い森、
 * 手前に映る東にはプレイヤーを隠さない低い茂みを置く。
 * @returns 柵・森・茂みの装飾オブジェクト
 */
const createWorldBorder = (): DecorationMapObject[] => {
  const random = createRandom(20261013);
  const objects: DecorationMapObject[] = [];
  const segments = Math.round((WORLD_HALF * 2) / FENCE_SEGMENT_LENGTH);

  // --- 柵。西・東は南の角から波打ちぎわまで、南は西の角から東の角まで ---
  for (let index = 0; index < segments; index += 1) {
    const along = -WORLD_HALF + FENCE_SEGMENT_LENGTH * (index + 0.5);
    const fence = (id: string, x: number, z: number, rotationY: number) =>
      objects.push(decorationAt("fence", id, x, z, 1, rotationY));
    fence(`fence-west-${index}`, -WORLD_HALF, along, Math.PI / 2);
    fence(`fence-east-${index}`, WORLD_HALF, along, Math.PI / 2);
    fence(`fence-south-${index}`, along, -WORLD_HALF, 0);
  }

  /**
   * 柵の外の帯に、升目ごとに1つずつ植える。
   * @param idPrefix - IDの接頭辞
   * @param kinds - 植える種類の候補
   * @param depth - 柵からの奥行き
   * @param toPoint - 帯の中の位置（along: 柵に沿った向き、out: 柵からの距離）を町の座標へ変える
   * @param alongRange - 柵に沿った向きの範囲
   * @param scaleRange - 拡大率の範囲
   */
  const plantBand = (
    idPrefix: string,
    kinds: readonly DecorationKind[],
    depth: number,
    toPoint: (along: number, out: number) => { x: number; z: number },
    alongRange: { from: number; to: number },
    scaleRange: { max: number; min: number },
  ) => {
    const rows = Math.floor(depth / FOREST_CELL);
    const columns = Math.floor((alongRange.to - alongRange.from) / FOREST_CELL);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        // 升目の中でずらす。柵に近い側は少し空けて、柵に木がめり込まないようにする
        const along = alongRange.from + FOREST_CELL * (column + 0.2 + random() * 0.6);
        const out = 1 + FOREST_CELL * (row + random() * 0.6);
        const kind = kinds[Math.floor(random() * kinds.length)];
        const scale = scaleRange.min + random() * (scaleRange.max - scaleRange.min);
        const rotationY = random() * Math.PI * 2;
        const point = toPoint(along, out);
        objects.push(
          borderDecoration(kind, `${idPrefix}-${row}-${column}`, point.x, point.z, scale, rotationY),
        );
      }
    }
  };

  const forestScale = { max: 1.7, min: 1.1 };
  // 西の森。砂浜（波打ちぎわから BEACH_DEPTH）の手前まで。南の森と角で重ならないよう、南は柵の角から
  plantBand(
    "forest-west",
    FOREST_TREES,
    FOREST_DEPTH,
    (along, out) => ({ x: -WORLD_HALF - out, z: along }),
    { from: -WORLD_HALF, to: SHORE_Z - BEACH_DEPTH },
    forestScale,
  );
  // 南の森。南西の角（柵の外どうしが接する所）も埋める
  plantBand(
    "forest-south",
    FOREST_TREES,
    FOREST_DEPTH,
    (along, out) => ({ x: along, z: -WORLD_HALF - out }),
    { from: -WORLD_HALF - FOREST_DEPTH, to: WORLD_HALF },
    forestScale,
  );
  // 東の茂み
  plantBand(
    "hedge-east",
    HEDGE_BUSHES,
    HEDGE_DEPTH,
    (along, out) => ({ x: WORLD_HALF + out, z: along }),
    { from: -WORLD_HALF, to: SHORE_Z - BEACH_DEPTH },
    { max: 1.2, min: 0.9 },
  );

  return objects;
};

/**
 * RPGハブの初期マップ。手で置いた町と、その外へ散らした自然物、町の境界を合わせたもの。
 * 散らすほうは決まった種の擬似乱数なので、毎回まったく同じ並びになる。
 */
export const INITIAL_MAP_OBJECTS: MapObject[] = [
  ...TOWN_MAP_OBJECTS,
  ...scatterNature(TOWN_MAP_OBJECTS),
  ...createWorldBorder(),
  // 自分の家の中（Issue #444）。町から離れた場所に置き、テレポートで出入りする
  ...HOUSE_INTERIOR_OBJECTS,
];

/**
 * 現状 mapStore は INITIAL_MAP_OBJECTS を直接使っており、この先の2関数は本番コードから未使用（テストのみ）。
 * docs/RPG_HUB_ARCHITECTURE.md 5.2節で設計済みの Supabase map_objects テーブル移行時に、
 * 受信データの検証層として利用する想定のため意図的に残している（#101）。
 */
type ParseResult =
  | { object: MapObject; success: true }
  | { errors: string[]; success: false };

/**
 * 値がオブジェクト（配列でない）かどうかを判定する。
 * @param value - 判定する値
 * @returns オブジェクトの場合は true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 値が正の数値かどうかを検証する。
 * @param value - 検証する値
 * @returns 正の有限数値の場合はその値、そうでない場合は null
 */
function parsePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 値が有効な 3D 座標（Vector3）かどうかを検証する。
 * @param value - 検証する値
 * @returns 有効な座標の場合は Vector3、そうでない場合は null
 */
function parsePosition(value: unknown): Vector3 | null {
  if (!isRecord(value)) return null;
  const coordinates = [value.x, value.y, value.z];
  return coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? { x: value.x as number, y: value.y as number, z: value.z as number }
    : null;
}

/**
 * 値が有効な衝突判定の大きさかどうかを検証する。
 * @param value - 検証する値
 * @returns 有効な場合は幅・奥行き、そうでない場合は null
 */
function parseCollisionSize(value: unknown): { depth: number; width: number } | null {
  if (!isRecord(value)) return null;
  const depth = parsePositiveNumber(value.depth);
  const width = parsePositiveNumber(value.width);
  return depth !== null && width !== null ? { depth, width } : null;
}

/** 着せ替え品を付けられる枠（検証用）。一覧は types/map.ts が1か所で持つ。 */
const EQUIPMENT_SLOT_SET = new Set<EquipmentSlot>(EQUIPMENT_SLOTS);

/**
 * 身に着けているものの指定を検証する。
 *
 * 枠と、アイテムが申告する枠が一致することまで見る。一致を要求しないと、顔用のアイテムを
 * 頭の枠に保存できてしまい、`resolveEquipment` に黙って落とされて「保存できたのに
 * 出てこない」状態になる（#223 の `scale` の NaN と同じ形）。
 * @param value - 検証する値
 * @returns 有効な場合は装備の指定、そうでない場合は null
 */
function parseEquipment(value: unknown): Partial<Record<EquipmentSlot, AssetId>> | null {
  if (!isRecord(value)) return null;

  const equipment: Partial<Record<EquipmentSlot, AssetId>> = {};
  for (const [slot, assetId] of Object.entries(value)) {
    if (!EQUIPMENT_SLOT_SET.has(slot as EquipmentSlot)) return null;
    const model = resolveAssetId(assetId);
    if (model === null || getWearableSlot(model) !== slot) return null;
    equipment[slot as EquipmentSlot] = model;
  }
  return equipment;
}

/**
 * 外部入力からマップオブジェクトをパースし、型と内容を検証する。
 * @param value - パースする値
 * @returns 成功時は検証済みのマップオブジェクト、失敗時はエラーメッセージ配列
 */
export function parseMapObject(value: unknown): ParseResult {
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  const errors: string[] = [];
  const id = typeof value.id === "string" && value.id.trim() ? value.id : null;
  const position = parsePosition(value.position);
  const model = resolveAssetId(value.model);
  const scale = value.scale === undefined ? undefined : parsePositiveNumber(value.scale);
  const rotationY = value.rotationY;
  const collidable = typeof value.collidable === "boolean" ? value.collidable : null;
  // collisionSize は種類を問わず受け付ける。建物だけでなく装飾物も衝突するため（Issue #193）。
  const collisionSize = parseCollisionSize(value.collisionSize);
  const palette = parsePalette(value.palette);
  const equipment = parseEquipment(value.equipment);

  if (!id) errors.push("idが不正です");
  if (!position) errors.push("positionが不正です");
  if (!model) errors.push("modelが許可されていません");
  if (value.scale !== undefined && scale === null) errors.push("scaleが不正です");
  if (collidable === null) errors.push("collidableが不正です");
  if (value.collisionSize !== undefined && collisionSize === null) {
    errors.push("collisionSizeが不正です");
  }
  // 大きさがないと衝突判定から静かに外れてしまうため、データの時点で弾く。
  if (collidable === true && collisionSize === null) {
    errors.push("collidable: trueにはcollisionSizeが必要です");
  }
  if (rotationY !== undefined && (typeof rotationY !== "number" || !Number.isFinite(rotationY))) {
    errors.push("rotationYが不正です");
  }
  if (value.palette !== undefined && palette === null) errors.push("paletteが不正です");
  if (value.equipment !== undefined && equipment === null) errors.push("equipmentが不正です");
  // 付く先の無い装備を弾く。建物や装飾にはアンカーが無いので、帽子を持たせても
  // resolveEquipment に黙って落とされ、「保存できたのに出てこない」状態になる。
  // キャラクターであっても、その枠のアンカーを持たなければ同じなので、枠ごとに見る。
  // 見るのは実際に付く点（resolveEquipment と同じ）。つけひげは face 枠でも口元（mouth）に
  // 付くため、face のアンカーだけを見ると、mouth を持たないキャラクターで同じ状態になる（Issue #374）。
  if (model !== null && equipment !== null) {
    const unattachable = Object.entries(equipment).some(
      (entry) =>
        getSlotAnchor(model, getWearableAnchorPoint(entry[1]) ?? (entry[0] as EquipmentSlot)) === null,
    );
    if (unattachable) errors.push("equipmentを付けられないアセットです");
  }

  const base = {
    collidable: collidable ?? false,
    id: id ?? "",
    model: model ?? RPG_HUB_ASSETS.tree,
    position: position ?? { x: 0, y: 0, z: 0 },
    ...(collisionSize === null ? {} : { collisionSize }),
    ...(equipment === null ? {} : { equipment }),
    ...(palette === null ? {} : { palette }),
    ...(scale === undefined ? {} : { scale: scale ?? 1 }),
    ...(rotationY === undefined ? {} : { rotationY: rotationY as number }),
  };

  if (value.type === "decoration") {
    if (value.interactive !== false) errors.push("decorationはinteractive: falseが必要です");
    // 装飾には装飾のアセットしか使えない。建物やキャラクターのIDを装飾として
    // 保存されると、当たり判定なしの建物が庭に建ってすり抜けられる（Issue #223）。
    if (model !== null && getDecorationPlacement(model) === null) {
      errors.push("modelが装飾のアセットではありません");
    }
    return errors.length
      ? { errors, success: false }
      : { object: { ...base, interactive: false, type: "decoration" }, success: true };
  }

  if (value.type === "building") {
    const route = typeof value.route === "string" && MAP_ROUTE_IDS.has(value.route as MapRouteId)
      ? (value.route as MapRouteId)
      : null;
    const entranceOffset = parsePosition(value.entranceOffset);
    const interactionRadius = parsePositiveNumber(value.interactionRadius);
    if (!route) errors.push("routeが許可されていません");
    // 建物は collidable の値に関わらず collisionSize が必須（型でも必須にしている）。
    // collidable: true の場合は共通の検証で拾うため、ここでは false の場合だけを見る。
    if (collidable === false && value.collisionSize === undefined) {
      errors.push("建物にはcollisionSizeが必要です");
    }
    if (!entranceOffset) errors.push("entranceOffsetが不正です");
    if (!interactionRadius) errors.push("interactionRadiusが不正です");
    if (value.interactive !== true) errors.push("buildingはinteractive: trueが必要です");
    const tag = typeof value.tag === "string" && value.tag.trim() ? value.tag.trim() : undefined;
    if (value.tag !== undefined && tag === undefined) errors.push("tagが不正です");
    // houseOwnerId は任意。家族一人ひとりの家（Issue #244）の持ち主の users.id を入れる。
    const houseOwnerId = value.houseOwnerId;
    if (houseOwnerId !== undefined && (typeof houseOwnerId !== "string" || !houseOwnerId.trim())) {
      errors.push("houseOwnerIdが不正です");
    }
    return errors.length
      ? { errors, success: false }
      : {
          object: {
            ...base,
            collisionSize: collisionSize as { depth: number; width: number },
            entranceOffset: entranceOffset as Vector3,
            ...(houseOwnerId === undefined ? {} : { houseOwnerId: houseOwnerId as string }),
            interactionRadius: interactionRadius as number,
            interactive: true,
            route: route as MapRouteId,
            ...(tag === undefined ? {} : { tag }),
            type: "building",
          },
          success: true,
        };
  }

  if (value.type === "npc") {
    const dialogueId = typeof value.dialogueId === "string" && value.dialogueId.trim()
      ? value.dialogueId
      : null;
    const name = typeof value.name === "string" && value.name.trim() ? value.name : null;
    const interactionRadius = parsePositiveNumber(value.interactionRadius);
    // familyMemberId は任意。家族の users.id を入れる想定で、まだ運用していない。
    const familyMemberId = value.familyMemberId;
    if (!dialogueId) errors.push("dialogueIdが不正です");
    if (!name) errors.push("nameが不正です");
    if (!interactionRadius) errors.push("interactionRadiusが不正です");
    if (value.interactive !== true) errors.push("npcはinteractive: trueが必要です");
    if (familyMemberId !== undefined && (typeof familyMemberId !== "string" || !familyMemberId.trim())) {
      errors.push("familyMemberIdが不正です");
    }
    return errors.length
      ? { errors, success: false }
      : {
          object: {
            ...base,
            dialogueId: dialogueId as string,
            ...(familyMemberId === undefined ? {} : { familyMemberId: familyMemberId as string }),
            interactionRadius: interactionRadius as number,
            interactive: true,
            name: name as string,
            type: "npc",
          },
          success: true,
        };
  }

  errors.push("typeが許可されていません");
  return { errors, success: false };
}

/**
 * マップオブジェクトの配列をパースし、ID重複などの検証を行う。
 * @param values - パースする値の配列
 * @returns 検証済みのマップオブジェクト配列とエラーメッセージ配列
 */
export function parseMapObjects(values: unknown[]): { errors: string[]; objects: MapObject[] } {
  const errors: string[] = [];
  const objects: MapObject[] = [];
  const ids = new Set<string>();

  values.forEach((value, index) => {
    const result = parseMapObject(value);
    if ("errors" in result) {
      errors.push(...result.errors.map((error) => `${index}: ${error}`));
      return;
    }
    if (ids.has(result.object.id)) {
      errors.push(`${index}: idが重複しています (${result.object.id})`);
      return;
    }
    ids.add(result.object.id);
    objects.push(result.object);
  });

  return { errors, objects };
}
