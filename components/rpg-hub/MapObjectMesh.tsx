import type { ThreeEvent } from "@react-three/fiber";
import { RPG_HUB_ASSETS } from "../../lib/rpg-hub/assets";
import type { MapObject } from "../../types/map";
import { BuildingMesh } from "./BuildingMesh";

export function MapObjectMesh({ object, onPress }: { object: MapObject; onPress: (object: MapObject) => void }) {
  const isTree = object.type === "decoration";

  return (
    <group
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[0, object.rotationY ?? 0, 0]}
      scale={object.scale ?? 1}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (object.interactive) onPress(object);
      }}
    >
      {isTree ? (
        <mesh>
          <coneGeometry args={[0.9, 1.8, 8]} />
          <meshStandardMaterial color="#2f855a" />
        </mesh>
      ) : (
        <BuildingMesh assetId={object.model} />
      )}
    </group>
  );
}
