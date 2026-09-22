import type {
  AssetId,
  DecorationMapObject,
  EquipmentSlot,
  MapObject,
  MapRouteId,
  NpcMapObject,
  PaletteSlot,
  Vector3,
} from "../../types/map";
import { EQUIPMENT_SLOTS } from "../../types/map.ts";
import { RPG_HUB_ASSETS, resolveAssetId } from "./assets.ts";
import {
  ASSET_CATALOG,
  getDecorationPlacement,
  getSlotAnchor,
  getWearableSlot,
  groundedY,
  type AssetDefinition,
  type DecorationPlacement,
} from "./catalog.ts";

/** 許可されたマップルートIDのセット（検証用） */
const MAP_ROUTE_IDS = new Set<MapRouteId>([
  "bank",
  "history",
  "house",
  "store-child",
  "tasks-child",
  "wardrobe",
]);

/**
 * 建物の拡大率。見た目・当たり判定・入口の位置すべてに掛かる。
 * 4棟とも、パーツの底面がローカル座標の y = -1.2 に揃うように作られているため、
 * 拡大したぶんだけ position.y も上げないと建物が地面へ沈む（y = 1.2 * BUILDING_SCALE）。
 *
 * 1.4 では住人（高さ約1.5）やプレイヤー（約1.0）と並べたときに建物が大きすぎたため
 * 1.1 へ下げた（Issue #214）。小さくすると当たり判定の手前の面も奥へ下がるので、
 * **扉の前に立つ位置が道から外れないよう、4棟の position.z も同じぶん動かしている**
 * （南は -5.2 → -4.8、北は 5.2 → 5.6）。
 */
const BUILDING_SCALE = 1.1;

/** 拡大した建物の原点の高さ。底面を地面に合わせる。 */
const BUILDING_Y = 1.2 * BUILDING_SCALE;

/**
 * 家具（WARDROBE_PARTS の姿見）の原点の高さ。底面を地面に合わせる。
 * 4棟の建物とは別物で、BUILDING_SCALE は掛けない（等身大の家具のため）。
 */
const MIRROR_Y = 0.6;

/**
 * 自分の家の中の中心座標（Issue #235）。
 *
 * 町（原点付近）から離れた場所に置く。`scatterNature` が自然物を散らす範囲
 * （`SCATTER_HALF` = 34）の外なので、家の中に木や岩が生えてこない。
 */
const HOUSE_INTERIOR_CENTER = { x: 0, z: -60 };

/**
 * 家の中へ入ったときにプレイヤーを立たせる位置（ChildHomeScreen.tsx が使う）。
 * 玄関（いちばん奥の細い通路、北側）の中央で、奥の部屋（南）を向かせる。
 */
export const HOUSE_INTERIOR_ENTRY = {
  facingY: Math.PI,
  x: HOUSE_INTERIOR_CENTER.x,
  z: HOUSE_INTERIOR_CENTER.z + 7.5,
};

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
 * 当たり判定を持つ装飾物を作る。
 * @param kind - 装飾物の種類
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @param scale - 拡大率。同じ形が並んで見えないよう1つずつ変える
 * @param rotationY - Y軸まわりの回転（ラジアン）
 * @returns 装飾オブジェクト
 */
const decoration = (
  kind: DecorationKind,
  id: string,
  x: number,
  z: number,
  scale = 1,
  rotationY = 0,
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
 * 道のタイルを1枚作る。
 * 道は**当たり判定を持たせない**。歩く場所を示すためのもので、塞ぐためのものではない。
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @returns 装飾オブジェクト
 */
const pathTile = (id: string, x: number, z: number): DecorationMapObject => ({
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
 * 形は VILLAGER_PARTS 共通で、`palette` の色だけを1体ずつ変える。家族の人数ぶん
 * キャラクターを増やしてもアセットは1つで済ませるため。
 *
 * 家族の人を出すときは `familyMemberId`（users.id）を渡す。いまいるのは町の住人なので
 * 持たせていない。
 *
 * **向き（rotationY）は 0 前後にする。** カメラはプレイヤーの +X+Z 側から見下ろしているため
 * （scene.ts の CAMERA_OFFSET）、画面に映るのは +X 面と +Z 面。住人の顔は +Z 向きに作って
 * あるので、半回転させると後頭部しか見えなくなる。建物の扉が +Z を向いているのと同じ理由。
 *
 * @param options - NPCの設定
 * @returns NPCオブジェクト
 */
const npc = (options: {
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
  // 人1人ぶん。すり抜けられると、その場にいる感じが出ない
  collisionSize: { depth: 0.7, width: 0.7 },
  dialogueId: options.dialogueId,
  ...(options.familyMemberId === undefined ? {} : { familyMemberId: options.familyMemberId }),
  id: options.id,
  interactionRadius: 2.2,
  interactive: true,
  model: RPG_HUB_ASSETS.villager,
  name: options.name,
  palette: options.palette,
  // 足の底(-0.71)を地面へ合わせる
  position: { x: options.x, y: 0.66, z: options.z },
  rotationY: options.rotationY ?? 0,
  type: "npc",
});

/**
 * 道のタイル1枚の一辺。カタログの `path` から引く。
 * 直接書くと、タイルの大きさを変えたときに隙間や重なりが出る。
 */
const PATH_TILE_SIZE = ASSET_CATALOG.path.placement.size;

/**
 * 道を一直線に敷く。タイルを隙間なく並べるため、中心の間隔はタイルの一辺と同じにする。
 * @param idPrefix - 各タイルのIDの接頭辞
 * @param axis - 道が伸びる向き
 * @param fixed - 伸びる向きと直交する側の座標
 * @param from - 端のタイルの中心
 * @param count - タイルの枚数
 * @returns 装飾オブジェクトの配列
 */
const pathLine = (
  idPrefix: string,
  axis: "x" | "z",
  fixed: number,
  from: number,
  count: number,
): DecorationMapObject[] =>
  Array.from({ length: count }, (_, index) => {
    const along = from + index * PATH_TILE_SIZE;
    return axis === "x"
      ? pathTile(`${idPrefix}-${index}`, along, fixed)
      : pathTile(`${idPrefix}-${index}`, fixed, along);
  });

/**
 * 家の中の壁1枚の一辺。カタログの `houseWall` から引く（`PATH_TILE_SIZE` と同じ考え方）。
 */
const HOUSE_WALL_TILE_SIZE = ASSET_CATALOG.houseWall.placement.size;

/**
 * 家の中の壁を一直線に並べる。`pathLine` の壁バージョン。
 * @param idPrefix - 各タイルのIDの接頭辞
 * @param axis - 壁が伸びる向き
 * @param fixed - 伸びる向きと直交する側の座標
 * @param from - 端の壁の中心
 * @param count - 壁の枚数
 * @returns 装飾オブジェクトの配列
 */
const houseWallLine = (
  idPrefix: string,
  axis: "x" | "z",
  fixed: number,
  from: number,
  count: number,
): DecorationMapObject[] =>
  Array.from({ length: count }, (_, index) => {
    const along = from + index * HOUSE_WALL_TILE_SIZE;
    return axis === "x"
      ? decoration("houseWall", `${idPrefix}-${index}`, along, fixed)
      : decoration("houseWall", `${idPrefix}-${index}`, fixed, along);
  });

/** 道を1マスずつ伸ばす向き。+Z が北。 */
type PathStep = "east" | "north" | "south" | "west";

/**
 * 1マスずつ向きを指定して道を敷く。
 *
 * `pathLine` は真っ直ぐにしか伸ばせないため、町の外へ曲がりながら延びる道に使う。
 * 町なかは「工」の形にきちんと敷いてあるが、外の道はわざと折れ曲がらせて、
 * 地面が均一に見えないようにしている。
 * @param idPrefix - 各タイルのIDの接頭辞
 * @param from - 1枚目のタイルの中心
 * @param steps - 2枚目以降を置く向き
 * @returns 装飾オブジェクトの配列
 */
const pathTrail = (
  idPrefix: string,
  from: { x: number; z: number },
  steps: readonly PathStep[],
): DecorationMapObject[] => {
  let { x, z } = from;
  const tiles = [pathTile(`${idPrefix}-0`, x, z)];

  steps.forEach((step, index) => {
    if (step === "east") x += PATH_TILE_SIZE;
    else if (step === "west") x -= PATH_TILE_SIZE;
    else if (step === "north") z += PATH_TILE_SIZE;
    else z -= PATH_TILE_SIZE;
    tiles.push(pathTile(`${idPrefix}-${index + 1}`, x, z));
  });
  return tiles;
};

/** 自然物を散らす範囲（中心からの距離）。 */
const SCATTER_HALF = 34;

/** 手で置いてある町の範囲。ここには散らさない。 */
const TOWN_HALF = { x: 13, z: 15 };

/** 物どうしのあいだに空ける最小の間隔。 */
const SCATTER_GAP = 0.45;

/**
 * 間隔を調べるための升目の一辺。
 *
 * 全部の物と総当たりで比べると、数百個置くころには起動が目に見えて遅くなる
 * （実測で約90ms、端末ではその数倍）。升目に振り分けて、隣接9マスだけを見る。
 * **いちばん離れていても効く距離（いちばん大きい建物の半分1.87 ＋ 散らす物の半分 ＋
 * 間隔 ≒ 2.9）より大きくとること。** 大きくとってあれば、中心の升目だけで振り分けても
 * 隣接9マスの中に必ず入る。
 */
const SCATTER_CELL = 4;

/** 種類ごとに散らす数。NATURE_VARIANTS と同じ並び（木・低木・岩・草むら）。 */
const SCATTER_COUNTS = [62, 46, 34, 58];

/**
 * 決まった種から同じ並びを返す擬似乱数（xorshift32）。
 *
 * **マップは毎回同じでなければならない。** 起動のたびに町の周りが変わると目印にならず、
 * 「重なっていない」ことをテストで押さえることもできなくなる。
 * @param seed - 種
 * @returns 0以上1未満を返す関数
 */
const createRandom = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
};

/**
 * 物どうしの間隔を見るための、おおよその半分の大きさ。
 * @param object - マップオブジェクト
 * @returns XZ平面上の半分の大きさ
 */
const footprint = (object: MapObject): { x: number; z: number } => {
  const scale = object.scale ?? 1;
  if (object.collisionSize) {
    return {
      x: (object.collisionSize.width * scale) / 2,
      z: (object.collisionSize.depth * scale) / 2,
    };
  }
  // 道のタイルと、当たり判定を持たない草むら
  return object.model === RPG_HUB_ASSETS.path
    ? { x: PATH_TILE_SIZE / 2, z: PATH_TILE_SIZE / 2 }
    : { x: 0.35 * scale, z: 0.35 * scale };
};

/**
 * 町の外へ自然物を散らす。
 *
 * 手で200個置くのは現実的でないため、決まった種の擬似乱数で位置・形・大きさ・向きを
 * 決める。**置く前に必ず既存の物との間隔を見て、重なる位置は捨てる。** これで
 * 「建物にめり込む」「道の上に立つ」が起きない（テストでも押さえてある）。
 *
 * @param base - すでに置いてあるもの（建物・道・町なかの装飾・NPC）
 * @returns 散らした装飾オブジェクト
 */
const scatterNature = (base: readonly MapObject[]): DecorationMapObject[] => {
  const random = createRandom(20260916);
  const scattered: DecorationMapObject[] = [];

  /** 升目 → そこに中心がある物。 */
  const grid = new Map<string, MapObject[]>();
  const cellOf = (x: number, z: number) =>
    `${Math.floor(x / SCATTER_CELL)}:${Math.floor(z / SCATTER_CELL)}`;
  const remember = (object: MapObject) => {
    const key = cellOf(object.position.x, object.position.z);
    const cell = grid.get(key);
    if (cell) cell.push(object);
    else grid.set(key, [object]);
  };
  /** 隣接9マスにある物を返す。 */
  const neighbours = (x: number, z: number): MapObject[] => {
    const found: MapObject[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const cell = grid.get(cellOf(x + dx * SCATTER_CELL, z + dz * SCATTER_CELL));
        if (cell) found.push(...cell);
      }
    }
    return found;
  };
  base.forEach(remember);

  NATURE_VARIANTS.forEach((variants, kindIndex) => {
    let remaining = SCATTER_COUNTS[kindIndex];
    // 置ける場所が見つからないまま回り続けないよう、試行回数に上限を置く
    let attempts = remaining * 60;

    while (remaining > 0 && attempts > 0) {
      attempts -= 1;
      const x = (random() * 2 - 1) * SCATTER_HALF;
      const z = (random() * 2 - 1) * SCATTER_HALF;
      if (Math.abs(x) < TOWN_HALF.x && Math.abs(z) < TOWN_HALF.z) continue;

      const kind = variants[Math.floor(random() * variants.length)];
      const scale = 0.8 + random() * 0.5;
      const half = (DECORATION_SPECS[kind].size * scale) / 2;
      const tooClose = neighbours(x, z).some((other) => {
        const otherHalf = footprint(other);
        return (
          Math.abs(x - other.position.x) < otherHalf.x + half + SCATTER_GAP &&
          Math.abs(z - other.position.z) < otherHalf.z + half + SCATTER_GAP
        );
      });
      if (tooClose) continue;

      const object = decoration(
        kind,
        `scatter-${kindIndex}-${remaining}`,
        x,
        z,
        scale,
        random() * Math.PI * 2,
      );
      scattered.push(object);
      remember(object);
      remaining -= 1;
    }
  });

  return scattered;
};

/**
 * RPGハブの初期マップオブジェクト（建物、装飾など）。
 *
 * 建物は中央から見た四隅に置き、中央と建物の裏を通れるようにしている。
 *
 * 道は「工」の形に敷いてある。4棟の扉はすべて +Z を向いているため、
 * クエストと銀行の前を通る南の道（z = -2.6）、ストアと履歴の前を通る北の道（z = 7.6）、
 * その2本をつなぐ中央の道（x = 0）の3本で、どの建物へも道なりに着く。
 * 出発地点(0, 0)は中央の道の上にある。
 *
 * 装飾物は道の上に置かない。街灯と花壇は道沿い、低木と木と岩は外側へ散らして、
 * 歩ける範囲に上限がないぶん、進む方向の目印になるようにしている。
 */
const TOWN_MAP_OBJECTS: MapObject[] = [
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // BuildingMesh.tsx の TasksBuilding: 扉(position=[0,-0.33,1.08])に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.08 },
    id: "tasks-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.tasks,
    position: { x: -5.6, y: BUILDING_Y, z: -4.8 },
    scale: BUILDING_SCALE,
    route: "tasks-child",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // BuildingMesh.tsx の BankBuilding: 扉(position=[0,-0.45,1.08])に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.08 },
    id: "bank-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.bank,
    position: { x: 5.6, y: BUILDING_Y, z: -4.8 },
    scale: BUILDING_SCALE,
    route: "bank",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // BuildingMesh.tsx の StoreBuilding: 左右2枚の扉(z=1.03)に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.03 },
    id: "store-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.store,
    position: { x: 5.6, y: BUILDING_Y, z: 5.6 },
    scale: BUILDING_SCALE,
    route: "store-child",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // BuildingMesh.tsx の HistoryBuilding: 扉(position=[0,-0.48,1.05])に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.05 },
    id: "history-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.history,
    position: { x: -5.6, y: BUILDING_Y, z: 5.6 },
    scale: BUILDING_SCALE,
    route: "history",
    type: "building",
  },
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
    // path-out-south の道の突き当たり(-3.6, -11.6)の正面に扉が向くように置いている
    position: { x: -3.6, y: BUILDING_Y, z: -13.6 },
    scale: BUILDING_SCALE,
    route: "house",
    type: "building",
  },

  // --- 自分の家の中（Issue #235） ---
  // 町から離れた場所に置く。テレポート（createPlacePlayerIntent）で出入りするので、
  // 町から歩いてもつながっているように見えるが実際は関係ない（ChildHomeScreen.tsx）。
  //
  // 「玄関（細い通路）→ 奥の部屋（玄関より横幅が広く、4倍の床面積）」のT字構成。
  // 玄関を狭くしたぶん、奥の部屋の北側の壁は玄関の幅ぶんだけ切れていて、
  // そこがそのまま玄関へつながる通り道になる（別に扉の当たり判定は置いていない）。
  ...houseWallLine("house-wall-south", "x", HOUSE_INTERIOR_CENTER.z - 6, HOUSE_INTERIOR_CENTER.x - 5.4, 10),
  ...houseWallLine("house-wall-east", "z", HOUSE_INTERIOR_CENTER.x + 6, HOUSE_INTERIOR_CENTER.z - 5.4, 10),
  ...houseWallLine("house-wall-west", "z", HOUSE_INTERIOR_CENTER.x - 6, HOUSE_INTERIOR_CENTER.z - 5.4, 10),
  // 奥の部屋の北側の壁。中央（玄関の幅ぶん）だけ切って通り道にする
  ...houseWallLine("house-wall-north-left", "x", HOUSE_INTERIOR_CENTER.z + 6, HOUSE_INTERIOR_CENTER.x - 5.4, 4),
  ...houseWallLine("house-wall-north-right", "x", HOUSE_INTERIOR_CENTER.z + 6, HOUSE_INTERIOR_CENTER.x + 1.8, 4),
  // 玄関（通路）の左右の壁。奥の部屋の北側の壁の切れ目とつながる位置から始める
  ...houseWallLine("house-wall-genkan-east", "z", HOUSE_INTERIOR_CENTER.x + 1.8, HOUSE_INTERIOR_CENTER.z + 6.6, 2),
  ...houseWallLine("house-wall-genkan-west", "z", HOUSE_INTERIOR_CENTER.x - 1.8, HOUSE_INTERIOR_CENTER.z + 6.6, 2),
  // 玄関のつきあたり（外の空間へそのまま出られないよう塞ぐ壁）
  ...houseWallLine("house-wall-genkan-north", "x", HOUSE_INTERIOR_CENTER.z + 9, HOUSE_INTERIOR_CENTER.x - 1.8, 4),

  // 更衣室（奥の部屋の左端、西側の壁を1辺として使う小部屋）。開口部は北（+Z）側で、
  // 他の建物と同じく扉は+Z向きという前提（movement.ts / 各種テスト）に合わせてある。
  ...houseWallLine("house-changing-room-south", "x", HOUSE_INTERIOR_CENTER.z - 1.8, HOUSE_INTERIOR_CENTER.x - 5.4, 3),
  ...houseWallLine("house-changing-room-east", "z", HOUSE_INTERIOR_CENTER.x - 2.4, HOUSE_INTERIOR_CENTER.z - 1.2, 3),
  {
    collidable: true,
    collisionSize: { depth: 0.4, width: 0.8 },
    // WARDROBE_PARTS の姿見に合わせた正面オフセット（+Z＝更衣室の開口部側）
    entranceOffset: { x: 0, y: 0, z: 0.2 },
    id: "house-mirror",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.wardrobe,
    position: { x: HOUSE_INTERIOR_CENTER.x - 4.2, y: MIRROR_Y, z: HOUSE_INTERIOR_CENTER.z - 0.5 },
    route: "wardrobe",
    type: "building",
  },
  // 姿見の前に道を1枚。「扉の真正面に道があること」のテストを満たすほか、
  // 目印にもなる（tests/rpgHub.test.mjs）。位置は house-mirror の
  // 当たり判定の外へ抜けた点（getBuildingExitPoint と同じ計算）に合わせてある
  pathTile("path-house-mirror", HOUSE_INTERIOR_CENTER.x - 4.2, HOUSE_INTERIOR_CENTER.z + 0.15),
  // 更衣室の開口部（北側）を囲むカーテン。当たり判定を持たないので通り道はふさがない
  decoration(
    "changingCurtain",
    "house-changing-room-curtain",
    HOUSE_INTERIOR_CENTER.x - 4.2,
    HOUSE_INTERIOR_CENTER.z + 1.8,
  ),
  // 最初から少しだけ家具を置いておく（残りは子供が「かざる」で自由に置く）。
  // 更衣室と重ならないよう、東側の壁沿いに寄せている
  decoration("hangerRack", "house-hanger-south", HOUSE_INTERIOR_CENTER.x + 4.5, HOUSE_INTERIOR_CENTER.z - 1, 1, 0.5),
  decoration("hangerRack", "house-hanger-north", HOUSE_INTERIOR_CENTER.x + 4.5, HOUSE_INTERIOR_CENTER.z + 2, 1, -0.5),

  // --- 道（当たり判定なし） ---
  // 南の道: クエスト(-5.6)と銀行(5.6)の扉の前を東西に通る
  ...pathLine("path-south", "x", -2.6, -5.4, 7),
  // 北の道: 履歴(-5.6)とストア(5.6)の扉の前を東西に通る。
  // 扉は z = 6.7 付近だが、建物の当たり判定でプレイヤーは z = 7.59 より手前へ入れない。
  // タイル（一辺1.8）の中心を 8.2 に置くと（範囲は 7.3 〜 9.1）、実際に立てる位置が道の上に乗る。
  ...pathLine("path-north", "x", 8.2, -5.4, 7),
  // 中央の道: 南北の道をつなぐ。出発地点(0, 0)はこの上
  ...pathLine("path-center", "z", 0, -0.8, 5),
  // 町の外へ延びる道。4方向とも途中で折れ曲がらせて、行き先がありそうに見せる
  ...pathTrail("path-out-north", { x: 0, z: 10 }, ["north", "north", "east", "east", "north", "north"]),
  ...pathTrail("path-out-south", { x: 0, z: -4.4 }, ["south", "south", "west", "west", "south", "south"]),
  ...pathTrail("path-out-east", { x: 7.2, z: -2.6 }, ["east", "east", "north", "north", "north"]),
  ...pathTrail("path-out-west", { x: -7.2, z: 8.2 }, ["west", "west", "south", "south"]),

  // --- 道沿い（街灯と花壇） ---
  decoration("lamp", "lamp-southwest", -3.6, -1, 1, 0),
  decoration("lamp", "lamp-southeast", 3.6, -1, 1, 0),
  decoration("lamp", "lamp-northwest", -3.2, 6.4, 1, 0),
  decoration("lamp", "lamp-northeast", 3.2, 6.4, 1, 0),
  decoration("lamp", "lamp-center-east", 1.7, 2.2, 1, 0),
  decoration("lamp", "lamp-center-west", -1.7, 4.4, 1, 0),
  decoration("flowerbed", "flowerbed-plaza-east", 2.6, 0.8, 1, 0.2),
  decoration("flowerbed", "flowerbed-plaza-west", -2.6, 0.8, 1, -0.3),
  decoration("flowerbed", "flowerbed-store-side", 2.4, 3.4, 0.9, 0.5),
  decoration("flowerbed", "flowerbed-history-side", -2.4, 3.4, 0.9, -0.15),

  // --- 低木（道と建物のあいだを埋める） ---
  decoration("bush", "bush-south-west", -2.1, -1.2, 1, 0.3),
  decoration("bush", "bush-south-east", 2.1, -1.2, 1.1, 1.2),
  decoration("bush", "bush-road-west-end", -6.9, -1.2, 0.95, 2),
  decoration("bush", "bush-road-east-end", 6.9, -1.2, 1.05, 0.8),
  decoration("bush", "bush-north-west-end", -8.8, 6.4, 1, 1.5),
  decoration("bush", "bush-north-east-end", 8.8, 6.4, 0.9, 2.4),
  decoration("bush", "bush-north-back-west", -1.9, 10, 1.1, 0.6),
  decoration("bush", "bush-north-back-east", 1.9, 10, 0.95, 1.8),
  decoration("bush", "bush-far-west", -7.9, 2.1, 1.15, 0.9),
  decoration("bush", "bush-far-east", 7.9, 2.1, 1, 2.2),

  // --- 木（外側の目印。等間隔に並べない） ---
  decoration("tree", "tree-store-front", 2.2, 5.4, 1, 0),
  decoration("tree", "tree-north", -1.8, 10.2, 1.15, 0.4),
  decoration("tree", "tree-south", 1.7, -8.2, 0.9, 1.1),
  decoration("tree", "tree-west", -9.4, 0.6, 1.2, 0.7),
  decoration("tree", "tree-east", 8.8, 0.2, 0.85, 1.9),
  decoration("tree", "tree-southeast", 10.6, -8.4, 1.1, 2.6),
  decoration("tree", "tree-southwest", -10.2, -7.6, 0.95, 0.2),
  decoration("tree", "tree-tasks-side", -2.9, -6.4, 1.05, 1.4),
  decoration("tree", "tree-bank-side", 3.1, -6.8, 0.9, 2.9),
  decoration("tree", "tree-far-north", -7.4, 10.4, 1.2, 0.5),
  decoration("tree", "tree-far-southeast", 7.2, -11.4, 1, 1.7),
  decoration("tree", "tree-far-northwest", -12.6, 5.8, 1.1, 2.1),

  // --- NPC ---
  // いまは町の住人2人。ゆくゆくは家族一人ひとりのキャラクターを置きたいので、
  // 見た目は palette の色だけで作り分けられるようにしてある。
  npc({
    dialogueId: "villager-guide",
    id: "npc-guide",
    name: "あんない人",
    palette: { accent: "#2f855a", hair: "#3f2a1d", skin: "#f3c9a4" },
    // 出発地点のそば、中央の道の脇。顔が見えるよう +Z を向きつつ、道（+X側）へ少し振る。
    // 花壇の当たり判定に重ならない位置にしている（重なると、そこから歩き出せない）
    rotationY: 0.4,
    x: -1.1,
    z: 2.8,
  }),
  npc({
    dialogueId: "villager-shopkeeper",
    id: "npc-shopkeeper",
    name: "みせばん",
    palette: { accent: "#c2410c", hair: "#1f2937", skin: "#e8b48c" },
    // 北の道のストア側の端、道の北側。道の上に立つと通れなくなるので外す。
    // 顔が見えるよう +Z を向きつつ、ストア（-X側）へ少し振る
    rotationY: -0.35,
    x: 5.4,
    z: 9.9,
  }),

  // --- 草むら（当たり判定なし。地面が単色の平面に見えないようにする） ---
  // 道の上には置かない。歩く場所が分かりにくくなるため
  decoration("grass", "grass-plaza-north", 1.2, 3.9, 1, 0.4),
  decoration("grass", "grass-plaza-south", -1.3, 1.5, 0.85, 2.1),
  decoration("grass", "grass-road-south-west", -4.3, -1.3, 1.1, 1.2),
  decoration("grass", "grass-road-south-east", 4.4, -1.4, 0.9, 2.7),
  decoration("grass", "grass-road-north-west", -2.6, 6.9, 1.05, 0.7),
  decoration("grass", "grass-road-north-east", 2.6, 6.9, 0.95, 1.9),
  decoration("grass", "grass-tasks-side", -3.1, -4.6, 1.15, 2.4),
  decoration("grass", "grass-bank-side", 3.4, -3.6, 0.9, 0.3),
  decoration("grass", "grass-west", -8.6, 1.4, 1.1, 1.6),
  decoration("grass", "grass-east", 8.4, 1.2, 1, 2.9),
  decoration("grass", "grass-far-north", -2.6, 10.6, 1.2, 0.9),
  decoration("grass", "grass-far-south", 1.8, -9.4, 1.05, 2.2),

  // --- 岩（さらに外側） ---
  decoration("rock", "rock-northwest", -8.8, 3.6, 1.1, 0.5),
  decoration("rock", "rock-northeast", 8.6, 4.4, 0.9, 1.9),
  decoration("rock", "rock-southwest", -8.6, -9.6, 1.2, 2.6),
  decoration("rock", "rock-far-north", 8.2, 9.4, 1, 0.9),
  decoration("rock", "rock-far-west", -11.4, -3.2, 0.95, 1.3),
  decoration("rock", "rock-far-east", 13.4, -2.8, 1.15, 2.8),
];

/**
 * RPGハブの初期マップ。手で置いた町と、その外へ散らした自然物を合わせたもの。
 * 散らすほうは決まった種の擬似乱数なので、毎回まったく同じ並びになる。
 */
export const INITIAL_MAP_OBJECTS: MapObject[] = [
  ...TOWN_MAP_OBJECTS,
  ...scatterNature(TOWN_MAP_OBJECTS),
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

/** 色を差し替えられる枠の一覧（検証用）。 */
const PALETTE_SLOTS = new Set<PaletteSlot>(["accent", "hair", "skin"]);

/** 16進カラーコード（#rrggbb）。 */
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

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
 * 色の差し替え指定を検証する。
 * 未知の枠や、16進カラーコード以外の値は受け付けない（描画側へそのまま渡すため）。
 * @param value - 検証する値
 * @returns 有効な場合は差し替え指定、そうでない場合は null
 */
function parsePalette(value: unknown): Partial<Record<PaletteSlot, string>> | null {
  if (!isRecord(value)) return null;

  const palette: Partial<Record<PaletteSlot, string>> = {};
  for (const [slot, color] of Object.entries(value)) {
    if (!PALETTE_SLOTS.has(slot as PaletteSlot)) return null;
    if (typeof color !== "string" || !COLOR_PATTERN.test(color)) return null;
    palette[slot as PaletteSlot] = color;
  }
  return palette;
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
  if (model !== null && equipment !== null) {
    const unattachable = Object.keys(equipment).some(
      (slot) => getSlotAnchor(model, slot as EquipmentSlot) === null,
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
    return errors.length
      ? { errors, success: false }
      : {
          object: {
            ...base,
            collisionSize: collisionSize as { depth: number; width: number },
            entranceOffset: entranceOffset as Vector3,
            interactionRadius: interactionRadius as number,
            interactive: true,
            route: route as MapRouteId,
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
