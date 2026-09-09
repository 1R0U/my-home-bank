import type { ThreeEvent } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber/native";
import type { StoreItem } from "../../types";

const CRATE_COLORS = ["#ef6a4e", "#facc15", "#38bdf8", "#4ade80", "#c084fc", "#fb923c"];

type ItemCrateProps = {
  colorIndex: number;
  isSelected: boolean;
  item: StoreItem;
  onSelect: (item: StoreItem) => void;
  position: [number, number, number];
};

function ItemCrate({ colorIndex, isSelected, item, onSelect, position }: ItemCrateProps) {
  const color = CRATE_COLORS[colorIndex % CRATE_COLORS.length];

  return (
    <group
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onSelect(item);
      }}
      position={position}
    >
      {isSelected && (
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[0.66, 0.66, 0.5]} />
          <meshStandardMaterial color="#f2c94c" />
        </mesh>
      )}
      <mesh scale={isSelected ? 1.06 : 1}>
        <boxGeometry args={[0.56, 0.56, 0.46]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.3, 0]} scale={isSelected ? 1.06 : 1}>
        <boxGeometry args={[0.6, 0.06, 0.5]} />
        <meshStandardMaterial color="#402416" />
      </mesh>
    </group>
  );
}

function ShelfPlank({ y }: { y: number }) {
  return (
    <mesh position={[0, y - 0.32, 0]}>
      <boxGeometry args={[3.4, 0.08, 0.7]} />
      <meshStandardMaterial color="#744126" />
    </mesh>
  );
}

type StoreShelfSceneProps = {
  onSelectItem: (item: StoreItem) => void;
  selectedItemId: string | null;
  shelves: StoreItem[][];
};

/**
 * 子供用ストア画面の商品棚エリアを3Dシーンで描画する。
 * RPGハブの建物外観（components/rpg-hub/BuildingMesh.tsx）と同様、
 * プリミティブ形状のみで構成し、外部3Dモデル・テクスチャは使わない。
 */
export function StoreShelfScene({ onSelectItem, selectedItemId, shelves }: StoreShelfSceneProps) {
  return (
    <Canvas
      camera={{ fov: 42, position: [0, 0.35, 4.4] }}
      gl={{ alpha: false }}
      style={{ backgroundColor: "#2b1b25" }}
    >
      <color args={["#2b1b25"]} attach="background" />
      <ambientLight intensity={1.2} />
      <directionalLight intensity={1.5} position={[2, 4, 3]} />
      <mesh position={[0, 0.4, -0.9]}>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial color="#3d2117" />
      </mesh>
      {shelves.map((rowItems, rowIndex) => {
        const y = 0.75 - rowIndex * 0.85;
        return (
          <group key={`shelf-row-${rowIndex}`}>
            <ShelfPlank y={y} />
            {rowItems.map((item, itemIndex) => (
              <ItemCrate
                colorIndex={rowIndex * rowItems.length + itemIndex}
                isSelected={item.id === selectedItemId}
                item={item}
                key={item.id}
                onSelect={onSelectItem}
                position={[(itemIndex - (rowItems.length - 1) / 2) * 0.85, y, 0]}
              />
            ))}
          </group>
        );
      })}
    </Canvas>
  );
}
