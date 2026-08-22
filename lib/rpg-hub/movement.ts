import type { MapObject } from "../../types/map";

const MAP_LIMIT = 6;

// Player.tsx の capsuleGeometry 半径（[0.45, 0.7, 8, 16]）に合わせた衝突判定用の半径
export const PLAYER_COLLISION_RADIUS = 0.45;

const clamp = (value: number) => Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, value));

function isBlocked(x: number, z: number, objects: readonly MapObject[]): boolean {
  return objects.some((object) => {
    if (!object.collidable || object.type !== "building") return false;
    const halfWidth = object.collisionSize.width / 2 + PLAYER_COLLISION_RADIUS;
    const halfDepth = object.collisionSize.depth / 2 + PLAYER_COLLISION_RADIUS;
    return (
      Math.abs(x - object.position.x) < halfWidth && Math.abs(z - object.position.z) < halfDepth
    );
  });
}

export function moveWithinMap(
  position: { x: number; z: number },
  delta: { x: number; z: number },
  objects: readonly MapObject[] = [],
): { x: number; z: number } {
  // X軸・Z軸を別々に判定することで、建物の角にひっかからず壁沿いに滑るように移動できる
  const nextX = clamp(position.x + delta.x);
  const x = isBlocked(nextX, position.z, objects) ? position.x : nextX;

  const nextZ = clamp(position.z + delta.z);
  const z = isBlocked(x, nextZ, objects) ? position.z : nextZ;

  return { x, z };
}

export function getJoystickMovement(
  dragX: number,
  dragY: number,
  radius: number,
  maxStep: number,
): {
  direction: "down" | "left" | "right" | "up" | null;
  knobX: number;
  knobY: number;
  x: number;
  z: number;
} {
  const distance = Math.hypot(dragX, dragY);
  if (!Number.isFinite(distance) || distance < 4 || radius <= 0 || maxStep <= 0) {
    return { direction: null, knobX: 0, knobY: 0, x: 0, z: 0 };
  }

  const clampedDistance = Math.min(distance, radius);
  const unitX = dragX / distance;
  const unitY = dragY / distance;
  const strength = clampedDistance / radius;
  const direction = Math.abs(unitX) > Math.abs(unitY)
    ? unitX > 0 ? "right" : "left"
    : unitY > 0 ? "down" : "up";

  return {
    direction,
    knobX: unitX * clampedDistance,
    knobY: unitY * clampedDistance,
    x: unitX * maxStep * strength,
    z: unitY * maxStep * strength,
  };
}
