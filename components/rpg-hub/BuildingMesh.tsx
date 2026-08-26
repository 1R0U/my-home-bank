import { RPG_HUB_ASSETS } from "../../lib/rpg-hub/assets";
import type { AssetId } from "../../types/map";

function BankBuilding() {
  return (
    <group>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[2.8, 1.8, 2.1]} />
        <meshStandardMaterial color="#dbeafe" />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[3, 0.24, 2.3]} />
        <meshStandardMaterial color="#2563a8" />
      </mesh>
      <mesh position={[0, 0.98, 0.08]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.55, 0.55, 4]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {[-0.92, 0.92].map((x) => (
        <group key={x} position={[x, -0.12, 1.12]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.2, 1.55, 10]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh position={[0, 0.84, 0]}>
            <boxGeometry args={[0.45, 0.14, 0.42]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[0, -0.84, 0]}>
            <boxGeometry args={[0.46, 0.14, 0.44]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.45, 1.08]}>
        <boxGeometry args={[0.72, 1.15, 0.08]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>
      <mesh position={[0, 1.38, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.1, 16]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.44, 0.84]}>
        <boxGeometry args={[0.08, 0.38, 0.04]} />
        <meshStandardMaterial color="#fff7cc" />
      </mesh>
    </group>
  );
}

function StoreBuilding() {
  return (
    <group>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[2.7, 1.8, 2]} />
        <meshStandardMaterial color="#fff3d6" />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.62, 0.95, 4]} />
        <meshStandardMaterial color="#dc5a3f" />
      </mesh>
      <mesh position={[0, 0.18, 1.14]} rotation={[0.14, 0, 0]}>
        <boxGeometry args={[2.85, 0.18, 0.7]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {[-1.08, -0.54, 0, 0.54, 1.08].map((x, index) => (
        <mesh key={x} position={[x, 0.19, 1.2]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.72]} />
          <meshStandardMaterial color={index % 2 === 0 ? "#ef6a4e" : "#fff7ed"} />
        </mesh>
      ))}
      <mesh position={[-0.68, -0.48, 1.03]}>
        <boxGeometry args={[0.82, 0.88, 0.08]} />
        <meshStandardMaterial color="#7dd3fc" metalness={0.1} roughness={0.25} />
      </mesh>
      <mesh position={[0.68, -0.48, 1.03]}>
        <boxGeometry args={[0.68, 1.16, 0.08]} />
        <meshStandardMaterial color="#9a4d2e" />
      </mesh>
      <mesh position={[0, 1.32, 0.82]}>
        <boxGeometry args={[1.45, 0.44, 0.12]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[0, 1.32, 0.9]}>
        <torusGeometry args={[0.13, 0.045, 8, 16]} />
        <meshStandardMaterial color="#fff7ed" />
      </mesh>
    </group>
  );
}

function TasksBuilding() {
  return (
    <group>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[2.7, 1.8, 2]} />
        <meshStandardMaterial color="#d9b98c" />
      </mesh>
      <mesh position={[0, 0.95, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.65, 1.05, 4]} />
        <meshStandardMaterial color="#6d3d78" />
      </mesh>
      {[-1.08, 1.08].map((x) => (
        <mesh key={x} position={[x, -0.25, 1.04]}>
          <boxGeometry args={[0.18, 1.9, 0.12]} />
          <meshStandardMaterial color="#6b4423" />
        </mesh>
      ))}
      <mesh position={[0, 0.43, 1.04]}>
        <boxGeometry args={[2.25, 0.17, 0.12]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <mesh position={[0, -0.33, 1.08]}>
        <boxGeometry args={[1.32, 1.25, 0.12]} />
        <meshStandardMaterial color="#8b5e34" />
      </mesh>
      <mesh position={[0, -0.28, 1.16]}>
        <boxGeometry args={[0.95, 0.86, 0.06]} />
        <meshStandardMaterial color="#f4e3bd" />
      </mesh>
      <mesh position={[-0.22, -0.25, 1.21]} rotation={[0, 0, -0.65]}>
        <boxGeometry args={[0.12, 0.42, 0.04]} />
        <meshStandardMaterial color="#7c3aed" />
      </mesh>
      <mesh position={[0.12, -0.34, 1.21]} rotation={[0, 0, 0.72]}>
        <boxGeometry args={[0.12, 0.72, 0.04]} />
        <meshStandardMaterial color="#7c3aed" />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.05, 8]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <mesh position={[0.35, 1.7, 0]}>
        <boxGeometry args={[0.7, 0.42, 0.05]} />
        <meshStandardMaterial color="#a855f7" />
      </mesh>
    </group>
  );
}

function HistoryBuilding() {
  return (
    <group>
      <mesh position={[0, -0.32, 0]}>
        <boxGeometry args={[2.7, 1.75, 2]} />
        <meshStandardMaterial color="#d8f3ec" />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[2.9, 0.22, 2.2]} />
        <meshStandardMaterial color="#176b67" />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[1.2, 1, 1.15]} />
        <meshStandardMaterial color="#f4e7c5" />
      </mesh>
      <mesh position={[0, 1.98, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.92, 0.65, 4]} />
        <meshStandardMaterial color="#176b67" />
      </mesh>
      <mesh position={[0, 1.42, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.08, 18]} />
        <meshStandardMaterial color="#fffaf0" />
      </mesh>
      <mesh position={[0, 1.5, 0.66]}>
        <boxGeometry args={[0.045, 0.28, 0.035]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0.1, 1.4, 0.66]} rotation={[0, 0, -0.9]}>
        <boxGeometry args={[0.04, 0.24, 0.035]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {[-0.92, 0.92].map((x) => (
        <mesh key={x} position={[x, -0.28, 1.04]}>
          <boxGeometry args={[0.28, 1.65, 0.16]} />
          <meshStandardMaterial color="#b98b5f" />
        </mesh>
      ))}
      <mesh position={[0, -0.48, 1.05]}>
        <boxGeometry args={[0.9, 1.1, 0.12]} />
        <meshStandardMaterial color="#245b57" />
      </mesh>
      <mesh position={[0, 0.18, 1.09]}>
        <boxGeometry args={[1.5, 0.32, 0.1]} />
        <meshStandardMaterial color="#d4a754" />
      </mesh>
    </group>
  );
}

export function BuildingMesh({ assetId }: { assetId: AssetId }) {
  if (assetId === RPG_HUB_ASSETS.bank) return <BankBuilding />;
  if (assetId === RPG_HUB_ASSETS.history) return <HistoryBuilding />;
  if (assetId === RPG_HUB_ASSETS.store) return <StoreBuilding />;
  if (assetId === RPG_HUB_ASSETS.tasks) return <TasksBuilding />;

  return (
    <mesh>
      <boxGeometry args={[2.6, 2.4, 2.2]} />
      <meshStandardMaterial color="#94a3b8" />
    </mesh>
  );
}
