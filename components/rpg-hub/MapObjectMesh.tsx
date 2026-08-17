import type { ThreeEvent } from "@react-three/fiber";
import type { MapObject } from "../../types/map";

const COLORS = {
  "bank-building": "#60a5fa",
  "building-store": "#f59e0b",
  "building-tasks": "#a78bfa",
  "decoration-tree": "#2f855a",
};

export function MapObjectMesh({ object, onPress }: { object: MapObject; onPress: (object: MapObject) => void }) {
  const color = COLORS[object.model as keyof typeof COLORS] ?? "#94a3b8";
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
