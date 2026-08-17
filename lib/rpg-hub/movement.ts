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
