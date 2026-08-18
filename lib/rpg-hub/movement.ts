const MAP_LIMIT = 6;

const clamp = (value: number) => Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, value));

export function moveWithinMap(
  position: { x: number; z: number },
  delta: { x: number; z: number },
): { x: number; z: number } {
  return {
    x: clamp(position.x + delta.x),
    z: clamp(position.z + delta.z),
  };
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
