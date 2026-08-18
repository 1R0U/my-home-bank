import { Canvas } from "@react-three/fiber/native";
import type { MapObject } from "../../types/map";
import { useMapStore } from "../../store/mapStore";
import { SEASON_COLORS } from "../../lib/rpg-hub/season";
import { MapObjectMesh } from "./MapObjectMesh";
import { Player } from "./Player";

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
      <ambientLight intensity={1.3} />
      <directionalLight intensity={1.8} position={[5, 10, 5]} />
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color={colors.ground} />
      </mesh>
      {objects.map((object) => (
        <MapObjectMesh key={object.id} object={object} onPress={onObjectPress} />
      ))}
      <Player />
    </Canvas>
  );
}
