import { PLAYER_COLLISION_RADIUS } from "../../lib/rpg-hub/movement";
import { usePlayerStore } from "../../store/playerStore";

export function Player() {
  const position = usePlayerStore((state) => state.position);

  return (
    <mesh position={[position.x, 0.65, position.z]}>
      <capsuleGeometry args={[PLAYER_COLLISION_RADIUS, 0.7, 8, 16]} />
      <meshStandardMaterial color="#ef4444" />
    </mesh>
  );
}
