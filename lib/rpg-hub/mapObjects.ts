import type {
  AssetId,
  DecorationMapObject,
  MapObject,
  MapRouteId,
  NpcMapObject,
  PaletteSlot,
  Vector3,
} from "../../types/map";
import { RPG_HUB_ASSETS, resolveAssetId } from "./assets.ts";

/** 許可されたマップルートIDのセット（検証用） */
const MAP_ROUTE_IDS = new Set<MapRouteId>([
  "bank",
  "history",
  "store-child",
  "tasks-child",
]);

/**
 * 建物の拡大率。見た目・当たり判定・入口の位置すべてに掛かる。
 * 4棟とも、パーツの底面がローカル座標の y = -1.2 に揃うように作られているため、
 * 拡大したぶんだけ position.y も上げないと建物が地面へ沈む（y = 1.2 * BUILDING_SCALE）。
 */
const BUILDING_SCALE = 1.4;

/** 拡大した建物の原点の高さ。底面を地面に合わせる。 */
const BUILDING_Y = 1.2 * BUILDING_SCALE;

/**
 * 装飾物の原点の高さを求める。
 * パーツはローカル原点を中心に組んであるため、底面が地面（y = -0.08）のすぐ下へ来るよう
 * 持ち上げる。わずかに埋めるのは、地面との境目が浮いて見えないようにするため。
 * @param halfHeight - ローカル原点から底面までの距離
 * @param scale - 拡大率
 * @returns position.y に入れる値
 */
const groundedY = (halfHeight: number, scale: number) => halfHeight * scale - 0.05;

/**
 * 装飾物の種類ごとの定義。
 *
 * `size` は当たり判定の一辺で、**すべて正方形にしている**。`isBlocked` は `rotationY` を
 * 反映しないため（#198）、正方形にしておけば回転させても見た目と判定がずれない。
 * 見た目より小さめにしているのは、葉や花のような外側まで塞ぐと歩きにくいため。
 */
const DECORATION_SPECS = {
  bush: { halfHeight: 0.375, model: RPG_HUB_ASSETS.bush, size: 0.9 },
  flowerbed: { halfHeight: 0.14, model: RPG_HUB_ASSETS.flowerbed, size: 1.7 },
  lamp: { halfHeight: 1, model: RPG_HUB_ASSETS.lamp, size: 0.4 },
  rock: { halfHeight: 0.3, model: RPG_HUB_ASSETS.rock, size: 0.9 },
  tree: { halfHeight: 0.9, model: RPG_HUB_ASSETS.tree, size: 0.6 },
} satisfies Record<string, { halfHeight: number; model: AssetId; size: number }>;

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
  kind: keyof typeof DECORATION_SPECS,
  id: string,
  x: number,
  z: number,
  scale = 1,
  rotationY = 0,
): DecorationMapObject => {
  const spec = DECORATION_SPECS[kind];
  return {
    collidable: true,
    collisionSize: { depth: spec.size, width: spec.size },
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

/** 道のタイル1枚の一辺（buildingParts.ts の PATH_PARTS と同じ）。 */
const PATH_TILE_SIZE = 1.8;

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
export const INITIAL_MAP_OBJECTS: MapObject[] = [
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // BuildingMesh.tsx の TasksBuilding: 扉(position=[0,-0.33,1.08])に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.08 },
    id: "tasks-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.tasks,
    position: { x: -5.6, y: BUILDING_Y, z: -5.2 },
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
    position: { x: 5.6, y: BUILDING_Y, z: -5.2 },
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
    position: { x: 5.6, y: BUILDING_Y, z: 5.2 },
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
    position: { x: -5.6, y: BUILDING_Y, z: 5.2 },
    scale: BUILDING_SCALE,
    route: "history",
    type: "building",
  },

  // --- 道（当たり判定なし） ---
  // 南の道: クエスト(-5.6)と銀行(5.6)の扉の前を東西に通る
  ...pathLine("path-south", "x", -2.6, -5.4, 7),
  // 北の道: 履歴(-5.6)とストア(5.6)の扉の前を東西に通る。
  // 扉は z = 6.6 付近だが、建物の当たり判定でプレイヤーは z = 7.61 より手前へ入れない。
  // タイル（一辺1.8）の中心を 8.2 に置くと、実際に立てる位置が道の上に乗る。
  ...pathLine("path-north", "x", 8.2, -5.4, 7),
  // 中央の道: 南北の道をつなぐ。出発地点(0, 0)はこの上
  ...pathLine("path-center", "z", 0, -0.8, 5),

  // --- 道沿い（街灯と花壇） ---
  decoration("lamp", "lamp-southwest", -3.6, -1, 1, 0),
  decoration("lamp", "lamp-southeast", 3.6, -1, 1, 0),
  decoration("lamp", "lamp-northwest", -3.6, 6.4, 1, 0),
  decoration("lamp", "lamp-northeast", 3.6, 6.4, 1, 0),
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
  decoration("bush", "bush-north-west-end", -6.9, 6.2, 1, 1.5),
  decoration("bush", "bush-north-east-end", 6.9, 6.2, 0.9, 2.4),
  decoration("bush", "bush-north-back-west", -1.2, 10, 1.1, 0.6),
  decoration("bush", "bush-north-back-east", 1.2, 10, 0.95, 1.8),
  decoration("bush", "bush-far-west", -7.9, 2.1, 1.15, 0.9),
  decoration("bush", "bush-far-east", 7.9, 2.1, 1, 2.2),

  // --- 木（外側の目印。等間隔に並べない） ---
  decoration("tree", "tree-store-front", 2.2, 5.4, 1, 0),
  decoration("tree", "tree-north", -1.8, 10.2, 1.15, 0.4),
  decoration("tree", "tree-south", 0.9, -8.2, 0.9, 1.1),
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
    // 出発地点のそば、中央の道の脇。顔が見えるよう +Z を向きつつ、道（+X側）へ少し振る
    rotationY: 0.4,
    x: -1.8,
    z: 1.4,
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

  // --- 岩（さらに外側） ---
  decoration("rock", "rock-northwest", -9.8, 4.6, 1.1, 0.5),
  decoration("rock", "rock-northeast", 9.8, 3.8, 0.9, 1.9),
  decoration("rock", "rock-southwest", -8.6, -9.6, 1.2, 2.6),
  decoration("rock", "rock-far-north", 8.2, 9.4, 1, 0.9),
  decoration("rock", "rock-far-west", -11.4, -3.2, 0.95, 1.3),
  decoration("rock", "rock-far-east", 11.6, -2, 1.15, 2.8),
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

  const base = {
    collidable: collidable ?? false,
    id: id ?? "",
    model: model ?? RPG_HUB_ASSETS.tree,
    position: position ?? { x: 0, y: 0, z: 0 },
    ...(collisionSize === null ? {} : { collisionSize }),
    ...(palette === null ? {} : { palette }),
    ...(scale === undefined ? {} : { scale: scale ?? 1 }),
    ...(rotationY === undefined ? {} : { rotationY: rotationY as number }),
  };

  if (value.type === "decoration") {
    if (value.interactive !== false) errors.push("decorationはinteractive: falseが必要です");
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
