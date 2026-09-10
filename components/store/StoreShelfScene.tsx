import type { ThreeEvent } from "@react-three/fiber";
import { Canvas, useLoader } from "@react-three/fiber/native";
import { TextureLoader } from "expo-three";
import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import type { StoreItem } from "../../types";

const CRATE_COLORS = ["#ef6a4e", "#facc15", "#38bdf8", "#4ade80", "#c084fc", "#fb923c"];

/** 棚1段ぶんの縦方向の間隔（ワールド座標）。2段だけ画面に収まり、3段目以降はスクロールで見える広さにする。 */
const ROW_SPACING = 1.3;
/** 同じ段の商品どうしの横方向の間隔（ワールド座標）。 */
const COLUMN_SPACING = 0.85;
/** 1段目の中心の高さ（ワールド座標）。 */
const FIRST_ROW_Y = 0.75;
/** スクロールなしで表示する段数。これを超えるぶん（3段以上）だけ縦スクロールできる。 */
const VISIBLE_ROWS = 2;
/** ドラッグ量（px）をワールド座標のスクロール量へ変換する係数。 */
const DRAG_TO_WORLD = 0.007;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** 商品画像のテクスチャ読み込みに失敗しても、木箱自体の表示は崩さないための境界。 */
class ItemPhotoBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function ItemPhoto({ imageUrl }: { imageUrl: string }) {
  const texture = useLoader(TextureLoader, imageUrl);

  return (
    <mesh position={[0, 0.03, 0.24]}>
      <planeGeometry args={[0.46, 0.46]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

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
      <ItemPhotoBoundary>
        <Suspense fallback={null}>
          <ItemPhoto imageUrl={item.image_url} />
        </Suspense>
      </ItemPhotoBoundary>
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
 * プリミティブ形状のみで構成し、外部3Dモデルは使わない。
 * 商品の見分けやすさのため、各木箱の正面には item.image_url のテクスチャを貼る
 * （読み込みに失敗した場合は ItemPhotoBoundary により木箱の色だけの表示にフォールバックする）。
 * 商品が多くて1画面に収まらない場合は、棚を縦にドラッグしてスクロールできる
 * （タップ＝商品選択と区別するため、一定距離より大きい縦方向の動きだけをスクロールとして扱う）。
 */
export function StoreShelfScene({ onSelectItem, selectedItemId, shelves }: StoreShelfSceneProps) {
  const maxScroll = Math.max(0, (shelves.length - VISIBLE_ROWS) * ROW_SPACING);

  const [scrollY, setScrollY] = useState(0);
  const scrollYRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  // スクロールバー（右端の小さいインジケーター）用の割合。
  const scrollProgress = maxScroll > 0 ? scrollY / maxScroll : 0;
  const thumbFraction = clamp(VISIBLE_ROWS / Math.max(shelves.length, 1), 0.2, 1);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          maxScroll > 0 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
          Math.abs(gesture.dy) >= 6,
        onPanResponderGrant: () => {
          dragStartScrollRef.current = scrollYRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = clamp(
            dragStartScrollRef.current - gesture.dy * DRAG_TO_WORLD,
            0,
            maxScroll,
          );
          scrollYRef.current = next;
          setScrollY(next);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [maxScroll],
  );

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Canvas
        camera={{ fov: 42, position: [0, 0.35, 4.4] }}
        gl={{ alpha: false }}
        style={{ backgroundColor: "#2b1b25" }}
      >
        <color args={["#2b1b25"]} attach="background" />
        <ambientLight intensity={1.2} />
        <directionalLight intensity={1.5} position={[2, 4, 3]} />
        <mesh position={[0, 0.35, -0.9]}>
          <planeGeometry args={[8, 12]} />
          <meshStandardMaterial color="#3d2117" />
        </mesh>
        <group position={[0, scrollY, 0]}>
          {shelves.map((rowItems, rowIndex) => {
            const y = FIRST_ROW_Y - rowIndex * ROW_SPACING;
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
                    position={[(itemIndex - (rowItems.length - 1) / 2) * COLUMN_SPACING, y, 0]}
                  />
                ))}
              </group>
            );
          })}
        </group>
      </Canvas>

      {maxScroll > 0 && (
        <View pointerEvents="none" style={scrollbarStyles.track}>
          <View
            style={[
              scrollbarStyles.thumb,
              {
                height: `${thumbFraction * 100}%`,
                top: `${scrollProgress * (1 - thumbFraction) * 100}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const scrollbarStyles = StyleSheet.create({
  thumb: {
    backgroundColor: "rgba(255, 248, 222, 0.6)",
    borderRadius: 2,
    left: 0,
    position: "absolute",
    right: 0,
  },
  track: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 2,
    bottom: 8,
    position: "absolute",
    right: 4,
    top: 8,
    width: 4,
  },
});
