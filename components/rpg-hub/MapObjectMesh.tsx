import type { ThreeEvent } from "@react-three/fiber";
import { RPG_HUB_ASSETS } from "../../lib/rpg-hub/assets";
import type { AssetId, MapObject } from "../../types/map";

const COLORS: Partial<Record<AssetId, string>> = {
  [RPG_HUB_ASSETS.bank]: "#60a5fa",
  [RPG_HUB_ASSETS.store]: "#f59e0b",
  [RPG_HUB_ASSETS.tasks]: "#a78bfa",
  [RPG_HUB_ASSETS.tree]: "#2f855a",
};

export function MapObjectMesh({ object, onPress }: { object: MapObject; onPress: (object: MapObject) => void }) {
  const color = COLORS[object.model] ?? "#94a3b8";
  const isTree = object.type === "decoration";

  return (
    <mesh
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[0, object.rotationY ?? 0, 0]}
      scale={object.scale ?? 1}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (object.interactive) onPress(object);
      }}
    >
      {isTree ? <coneGeometry args={[0.9, 1.8, 8]} /> : <boxGeometry args={[2.6, 2.4, 2.2]} />}
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
