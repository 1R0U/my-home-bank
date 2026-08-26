import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber/native";
import { Vector3 } from "three";
import type { MapObject } from "../../types/map";
import { useMapStore } from "../../store/mapStore";
import { usePlayerStore } from "../../store/playerStore";
import { SEASON_COLORS } from "../../lib/rpg-hub/season";
import { MapObjectMesh } from "./MapObjectMesh";
import { Player } from "./Player";

const CAMERA_OFFSET = new Vector3(9, 11, 9);

function PlayerFollowingCamera() {
  const position = usePlayerStore((state) => state.position);
  const lookAt = useRef(new Vector3());
  const destination = useRef(new Vector3());

  useFrame(({ camera }, delta) => {
    lookAt.current.set(position.x, 0, position.z);
    destination.current.copy(lookAt.current).add(CAMERA_OFFSET);
    camera.position.lerp(destination.current, 1 - Math.exp(-6 * delta));
    camera.lookAt(lookAt.current);
  });

  return null;
}

export function RpgHubScene({ onObjectPress }: { onObjectPress: (object: MapObject) => void }) {
  const currentSeason = useMapStore((state) => state.currentSeason);
  const objects = useMapStore((state) => state.objects);
  const colors = SEASON_COLORS[currentSeason];

  return (
    <Canvas
      camera={{ far: 100, near: 0.1, position: [10, 12, 12], zoom: 45 }}
      gl={{ alpha: false }}
      orthographic
      style={{ backgroundColor: colors.sky }}
    >
      <PlayerFollowingCamera />
      <color attach="background" args={[colors.sky]} />
      <ambientLight intensity={1.3} />
      <directionalLight intensity={1.8} position={[5, 10, 5]} />
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color={colors.ground} />
      </mesh>
      {objects.map((object) => (
        <MapObjectMesh key={object.id} object={object} onPress={onObjectPress} />
      ))}
      <Player />
    </Canvas>
  );
}
