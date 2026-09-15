import type { ThreeEvent } from "@react-three/fiber";
import { Canvas, useLoader } from "@react-three/fiber/native";
import { Asset } from "expo-asset";
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Image, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Loader, Texture } from "three";
import {
  SCROLL_DRAG_THRESHOLD_PX,
  getMaxScroll,
  getNextScroll,
  getRowPadding,
  getScrollbarMetrics,
  isTapWithinThreshold,
  isVerticalScrollGesture,
} from "../../lib/storeShelfScroll";
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
/** Switch Control 等向けの、棚スクロールの代替操作（1段ずつ進める/戻す）。 */
const ADJUSTABLE_SCROLL_ACTIONS = [
  { name: "increment", label: "次の段を見る" },
  { name: "decrement", label: "前の段を見る" },
] as const;

/**
 * リモートURL/ローカルアセットの画像を expo-gl 上のテクスチャとして読み込むローダー。
 * three.js 標準の TextureLoader はブラウザの Image 要素に依存していて RN では動かないため、
 * expo-asset でURIを解決し、expo-gl が受け付ける形（localUri を持つオブジェクト）で Texture を作る。
 * （expo-three の TextureLoader と同等の処理だが、peer 依存の競合を避けるため必要な部分だけ内製している）
 */
class ExpoUriTextureLoader extends Loader<Texture> {
  load(
    url: string,
    onLoad?: (texture: Texture) => void,
    _onProgress?: unknown,
    onError?: (error: unknown) => void,
  ): Texture {
    const texture = new Texture();

    (async () => {
      const asset = Asset.fromURI(url);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      const localUri = asset.localUri ?? asset.uri;

      let width = asset.width ?? 0;
      let height = asset.height ?? 0;
      if (!width || !height) {
        await new Promise<void>((resolve, reject) => {
          Image.getSize(
            localUri,
            (w, h) => {
              width = w;
              height = h;
              resolve();
            },
            (error) => reject(error),
          );
        });
        // expo-three と同じく Asset 側にも書き戻す（data に渡す asset の width/height を揃える）
        asset.width = width;
        asset.height = height;
      }

      // expo-three の TextureLoader と同じく、localUri だけでなく解決済み Asset を丸ごと渡す
      // （ネイティブ側の texImage2D バインディングが uri/type/hash など他のフィールドに
      // 依存している場合があるため）。
      texture.image = { data: asset, width, height } as unknown as HTMLImageElement;
      (texture as unknown as { isDataTexture: boolean }).isDataTexture = true;
      texture.needsUpdate = true;
      onLoad?.(texture);
    })().catch((error) => onError?.(error));

    return texture;
  }
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
  const texture = useLoader(ExpoUriTextureLoader, imageUrl);

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

function getPointerXY(event: ThreeEvent<PointerEvent>): { x: number; y: number } | null {
  const native = event.nativeEvent as { pageX?: number; pageY?: number };
  if (typeof native.pageX === "number" && typeof native.pageY === "number") {
    return { x: native.pageX, y: native.pageY };
  }
  return null;
}

function ItemCrate({ colorIndex, isSelected, item, onSelect, position }: ItemCrateProps) {
  const color = CRATE_COLORS[colorIndex % CRATE_COLORS.length];
  // ポインタを押した位置。離したときにほぼ動いていなければ「タップ」として選択する。
  // （縦ドラッグでスクロールしている最中に詳細パネルが開かないようにするため）
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <group
      onPointerCancel={() => {
        pointerDownRef.current = null;
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        pointerDownRef.current = getPointerXY(event);
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (isTapWithinThreshold(start, getPointerXY(event))) {
          onSelect(item);
        }
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
 * （タップ＝商品選択と区別するため、しきい値より大きい縦方向の動きだけをスクロールとして扱う。
 * スクロール・タップ判定のロジックは lib/storeShelfScroll.ts に切り出してテストしている）。
 */
export function StoreShelfScene({ onSelectItem, selectedItemId, shelves }: StoreShelfSceneProps) {
  const maxScroll = getMaxScroll(shelves.length, VISIBLE_ROWS, ROW_SPACING);
  const maxColumns = shelves.reduce((max, row) => Math.max(max, row.length), 1);

  const [scrollY, setScrollY] = useState(0);
  const scrollYRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  // アクセシブルボタンのオーバーレイ領域の実測ピクセル高さ（onLayoutで取得）。
  // 3Dシーンの scrollY と連動させて、スクロール後も画面上の木箱と同じ商品を
  // タップ/フォーカスできるようにするために使う。
  const [overlayHeight, setOverlayHeight] = useState(0);
  // VISIBLE_ROWS ぶんがちょうどオーバーレイの高さに収まる設計（3Dカメラと同じ想定）なので、
  // 1段あたりの高さは overlayHeight / VISIBLE_ROWS になる。
  const rowHeightPx = overlayHeight > 0 ? overlayHeight / VISIBLE_ROWS : 0;

  const { thumbFraction, thumbTopFraction } = getScrollbarMetrics(
    scrollY,
    maxScroll,
    VISIBLE_ROWS,
    shelves.length,
  );

  // 商品数が動的に変わって maxScroll が縮んだ場合、次にドラッグするまで scrollY が
  // 再クランプされず空白が表示される可能性があるため、都度クランプし直す。
  // 現状の MOCK_STORE_ITEMS は静的なので実害はないが、将来のライブデータ対応に備える。
  // updater は副作用を持たせず純粋にし、ref への書き込みはコミット後の
  // useLayoutEffect で行う（React が updater を複数回評価してもrefが壊れないように）。
  useEffect(() => {
    setScrollY((prev) => Math.min(prev, maxScroll));
  }, [maxScroll]);

  useLayoutEffect(() => {
    scrollYRef.current = scrollY;
  }, [scrollY]);

  // PanResponder への置き換えで、ScrollView が持っていた「スクロール可能」という
  // ネイティブのアクセシビリティ属性が失われるため、Switch Control 等の明示的な
  // スクロール操作（increment/decrement）に対応する代替手段を用意する。
  const scrollByRow = (direction: 1 | -1) => {
    const next = Math.min(Math.max(scrollYRef.current + direction * ROW_SPACING, 0), maxScroll);
    scrollYRef.current = next;
    setScrollY(next);
  };

  const handleAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === "increment") scrollByRow(1);
    else if (event.nativeEvent.actionName === "decrement") scrollByRow(-1);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // キャプチャ版も同じ条件で登録する。アクセシブルボタン（Pressable）上でドラッグを
        // 開始すると、そのボタンがタッチ開始時にレスポンダーを取ってしまい、
        // 非キャプチャ版の onMoveShouldSetPanResponder だけでは呼ばれずスクロールできない。
        // キャプチャ版は子がレスポンダーを取った後でも、縦ドラッグと判定した時点で
        // 親（このView）がレスポンダーを奪い取れる。
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          isVerticalScrollGesture(gesture.dx, gesture.dy, maxScroll, SCROLL_DRAG_THRESHOLD_PX),
        onMoveShouldSetPanResponder: (_, gesture) =>
          isVerticalScrollGesture(gesture.dx, gesture.dy, maxScroll, SCROLL_DRAG_THRESHOLD_PX),
        onPanResponderGrant: () => {
          dragStartScrollRef.current = scrollYRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = getNextScroll(
            dragStartScrollRef.current,
            gesture.dy,
            DRAG_TO_WORLD,
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
                    colorIndex={rowIndex * maxColumns + itemIndex}
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
        <View
          accessibilityActions={ADJUSTABLE_SCROLL_ACTIONS}
          accessibilityLabel="商品棚のスクロール"
          accessibilityRole="adjustable"
          accessibilityValue={{ max: Math.round(maxScroll * 100), min: 0, now: Math.round(scrollY * 100) }}
          accessible
          onAccessibilityAction={handleAccessibilityAction}
          style={scrollbarStyles.track}
        >
          <View
            style={[
              scrollbarStyles.thumb,
              {
                height: `${thumbFraction * 100}%`,
                top: `${thumbTopFraction * 100}%`,
              },
            ]}
          />
        </View>
      )}

      {/*
        3Dシーン内のタップ（レイキャスト）はスクリーンリーダーからは操作できないため、
        各商品に対応する透明なアクセシブルボタンを棚エリアに重ねる。
        同じ onSelectItem を呼び、選択状態も accessibilityState で通知する。
        pointerEvents="box-none" なので、ボタン以外の場所のタップは3Dシーンにそのまま届く。
        1段ぶんの高さ（rowHeightPx）と scrollY から translateY を計算し、3Dシーンの
        棚グループ（<group position={[0, scrollY, 0]}>）と同じ量だけオーバーレイも
        平行移動させることで、スクロール後も画面上の木箱と同じ商品にタップ/フォーカスが
        当たるようにする。
        各行内の配置は getRowPadding で3D側（中央揃え）と揃え、商品数が maxColumns と
        異なる段でも見た目のクレートとヒットボックスがずれないようにする。
        商品詳細パネルが手前に重なって表示されているときにこのオーバーレイを
        アクセシビリティツリーから除外する処理は、呼び出し側（ChildStoreScreen）の
        詳細パネルに隣接する要素で行う（accessibilityViewIsModal /
        importantForAccessibility="no-hide-descendants"）。ここでは常に有効にし、
        タップも常に3Dシーンへ届くようにする（3Dの直接タップでの選択切り替えを妨げないため）。
      */}
      <View
        onLayout={(event) => setOverlayHeight(event.nativeEvent.layout.height)}
        pointerEvents="box-none"
        style={a11yStyles.overlay}
      >
        <View
          pointerEvents="box-none"
          style={{ transform: [{ translateY: -(scrollY / ROW_SPACING) * rowHeightPx }] }}
        >
          {shelves.map((rowItems, rowIndex) => {
            const { leadingGap, trailingGap } = getRowPadding(rowItems.length, maxColumns);
            return (
              <View
                key={`a11y-row-${rowIndex}`}
                pointerEvents="box-none"
                style={[a11yStyles.row, { height: rowHeightPx }]}
              >
                {Array.from({ length: leadingGap }).map((_, gapIndex) => (
                  <View key={`a11y-lead-${gapIndex}`} pointerEvents="none" style={a11yStyles.hitbox} />
                ))}
                {rowItems.map((item) => (
                  <Pressable
                    accessibilityHint="タップすると商品の詳細が表示されます"
                    accessibilityLabel={`${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.id === selectedItemId }}
                    key={item.id}
                    onPress={() => onSelectItem(item)}
                    style={a11yStyles.hitbox}
                  />
                ))}
                {Array.from({ length: trailingGap }).map((_, gapIndex) => (
                  <View key={`a11y-trail-${gapIndex}`} pointerEvents="none" style={a11yStyles.hitbox} />
                ))}
              </View>
            );
          })}
        </View>
      </View>
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

const a11yStyles = StyleSheet.create({
  hitbox: { flex: 1 },
  overlay: {
    bottom: "14%",
    left: "8%",
    overflow: "hidden",
    position: "absolute",
    right: "8%",
    top: "6%",
  },
  row: { flexDirection: "row" },
});
