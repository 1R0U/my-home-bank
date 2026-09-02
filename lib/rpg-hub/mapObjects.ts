import type { MapObject, MapRouteId, Vector3 } from "../../types/map";
import { RPG_HUB_ASSETS, resolveAssetId } from "./assets.ts";

/** 許可されたマップルートIDのセット（検証用） */
const MAP_ROUTE_IDS = new Set<MapRouteId>([
  "bank",
  "history",
  "store-child",
  "tasks-child",
]);

/** RPGハブの初期マップオブジェクト（建物、装飾など） */
export const INITIAL_MAP_OBJECTS: MapObject[] = [
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    id: "tasks-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.tasks,
    position: { x: -3.8, y: 1.2, z: -3.5 },
    route: "tasks-child",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    id: "bank-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.bank,
    position: { x: 3.3, y: 1.2, z: -3.5 },
    route: "bank",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    id: "store-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.store,
    position: { x: 3.8, y: 1.2, z: 3.3 },
    route: "store-child",
    type: "building",
  },
  {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    id: "history-building",
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.history,
    position: { x: -3.3, y: 1.2, z: 3.5 },
    route: "history",
    type: "building",
  },
  {
    collidable: false,
    id: "tree-decoration",
    interactive: false,
    model: RPG_HUB_ASSETS.tree,
    position: { x: 5, y: 0.8, z: 4.8 },
    type: "decoration",
  },
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

  if (!id) errors.push("idが不正です");
  if (!position) errors.push("positionが不正です");
  if (!model) errors.push("modelが許可されていません");
  if (value.scale !== undefined && scale === null) errors.push("scaleが不正です");
  if (collidable === null) errors.push("collidableが不正です");
  if (rotationY !== undefined && (typeof rotationY !== "number" || !Number.isFinite(rotationY))) {
    errors.push("rotationYが不正です");
  }

  const base = {
    collidable: collidable ?? false,
    id: id ?? "",
    model: model ?? RPG_HUB_ASSETS.tree,
    position: position ?? { x: 0, y: 0, z: 0 },
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
    const collisionSize = isRecord(value.collisionSize)
      ? {
          depth: parsePositiveNumber(value.collisionSize.depth),
          width: parsePositiveNumber(value.collisionSize.width),
        }
      : null;
    const interactionRadius = parsePositiveNumber(value.interactionRadius);
    if (!route) errors.push("routeが許可されていません");
    if (!collisionSize?.depth || !collisionSize.width) errors.push("collisionSizeが不正です");
    if (!interactionRadius) errors.push("interactionRadiusが不正です");
    if (value.interactive !== true) errors.push("buildingはinteractive: trueが必要です");
    return errors.length
      ? { errors, success: false }
      : {
          object: {
            ...base,
            collisionSize: collisionSize as { depth: number; width: number },
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
