import type { DecorationMapObject, MapObject, MapRouteId, Vector3 } from "../../types/map";
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
 * 木の原点の高さ。円錐（高さ1.8）の底面が地面に来るよう持ち上げ、わずかに埋める。
 * scale を変えても埋まり具合が変わらないよう、拡大率に比例させる。
 * @param scale - 木の拡大率
 * @returns position.y に入れる値
 */
const treeY = (scale: number) => 0.9 * scale - 0.1;

/**
 * 装飾の木を作る。
 *
 * buildingParts.ts の TREE_PARTS は直径1.8の円錐だが、上へ広がる葉の部分までふさぐと
 * 通れる場所が狭く感じる。幹に近い0.6角の当たり判定にして、葉の下はかすめて通れるようにする。
 * 当たり判定にも scale が掛かるため、大きい木ほど幹も太い。
 *
 * @param id - オブジェクトID
 * @param x - X座標
 * @param z - Z座標
 * @param scale - 拡大率。同じ形が並んで見えないよう木ごとに変える
 * @param rotationY - Y軸まわりの回転（ラジアン）。円錐の稜線の向きが変わる
 * @returns 装飾オブジェクト
 */
const tree = (
  id: string,
  x: number,
  z: number,
  scale: number,
  rotationY: number,
): DecorationMapObject => ({
  collidable: true,
  collisionSize: { depth: 0.6, width: 0.6 },
  id,
  interactive: false,
  model: RPG_HUB_ASSETS.tree,
  position: { x, y: treeY(scale), z },
  rotationY,
  scale,
  type: "decoration",
});

/**
 * RPGハブの初期マップオブジェクト（建物、装飾など）。
 *
 * 建物は中央から見た四隅に置き、中央と建物の裏を通れるようにしている。
 * 歩ける範囲に上限はないため、木は建物の外側まで散らして、進む方向の目印にしている。
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
  // 木は等間隔に並べず、建物から離れた場所にまばらに置く。
  // ストア手前の1本だけは、当たり判定が建物と重なる位置に置いている
  // （中途半端なすき間があると、そこへ挟まったように見えるため）。
  tree("tree-store-front", 2.4, 6.4, 1, 0),
  tree("tree-north", -1.8, 8.6, 1.15, 0.4),
  tree("tree-south", 0.9, -8.2, 0.9, 1.1),
  tree("tree-west", -9.4, 0.6, 1.2, 0.7),
  tree("tree-east", 8.8, 0.2, 0.85, 1.9),
  tree("tree-southeast", 10.6, -8.4, 1.1, 2.6),
  tree("tree-southwest", -10.2, -7.6, 0.95, 0.2),
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

  const base = {
    collidable: collidable ?? false,
    id: id ?? "",
    model: model ?? RPG_HUB_ASSETS.tree,
    position: position ?? { x: 0, y: 0, z: 0 },
    ...(collisionSize === null ? {} : { collisionSize }),
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
    const interactionRadius = parsePositiveNumber(value.interactionRadius);
    if (!dialogueId) errors.push("dialogueIdが不正です");
    if (!interactionRadius) errors.push("interactionRadiusが不正です");
    if (value.interactive !== true) errors.push("npcはinteractive: trueが必要です");
    return errors.length
      ? { errors, success: false }
      : {
          object: {
            ...base,
            dialogueId: dialogueId as string,
            interactionRadius: interactionRadius as number,
            interactive: true,
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
