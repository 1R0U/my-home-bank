import { useMemo, useRef } from "react";
import { Animated, Image, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { getPlaceableFurniture, type HousePlaceableFurniture, type HousePlaceableKind } from "../lib/rpg-hub/houseLayout";
import { DRAGGED_FURNITURE_SIZE, type TrayDragState } from "./useFurnitureTrayDrag";

/** 指をこれだけ上へ動かしたら、家具を持ち上げたとみなす。少しの揺れで持ち上がらないように */
const LIFT_THRESHOLD = 8;

type Props = {
  /** 持ち上げている家具。その家具のボタンは薄くする（消すとドラッグが途切れるので、消さない） */
  draggingKind: HousePlaceableKind | null;
  /** しまってある家具（一覧の順） */
  items: readonly HousePlaceableFurniture[];
  /** ドラッグを始めた。pageX / pageY は画面全体での指の位置 */
  onDragStart: (kind: HousePlaceableKind, pageX: number, pageY: number) => void;
  /** ドラッグしている指が動いた */
  onDragMove: (pageX: number, pageY: number) => void;
  /** 指を離した（cancelled が true なら、ほかの操作に取られて途中でやめた） */
  onDragEnd: (pageX: number, pageY: number, cancelled: boolean) => void;
  /** タップした家具を、部屋のまんなかあたりに置く */
  onPlace: (kind: HousePlaceableKind) => void;
  /** 部屋に置いたときと同じ見た目の絵（PNG の data URL）。届いていない家具は絵文字を出す */
  thumbnails: Partial<Record<HousePlaceableKind, string>>;
};

/**
 * もようがえの一覧（Issue #425）。しまってある家具を横に並べる。
 *
 * - タップすると、今の階の部屋のまんなかあたりに置く
 * - 上へドラッグすると家具を持ち上げ、部屋の上で離すとそこに置く（位置は呼び出し側が部屋へ伝える）
 * - 横へのドラッグは一覧のスクロール（家具が増えて並びきらないとき）
 */
export function HouseFurnitureTray({ draggingKind, items, onDragEnd, onDragMove, onDragStart, onPlace, thumbnails }: Props) {
  return (
    <ScrollView horizontal contentContainerClassName="gap-3" showsHorizontalScrollIndicator={false}>
      {items.map((item) => (
        <FurnitureButton
          key={item.kind}
          isDragging={item.kind === draggingKind}
          item={item}
          onDragEnd={onDragEnd}
          onDragMove={onDragMove}
          onDragStart={onDragStart}
          onPlace={onPlace}
          thumbnail={thumbnails[item.kind]}
        />
      ))}
    </ScrollView>
  );
}

type FurnitureButtonProps = Omit<Props, "draggingKind" | "items" | "thumbnails"> & {
  isDragging: boolean;
  item: HousePlaceableFurniture;
  thumbnail?: string;
};

function FurnitureButton({ isDragging, item, onDragEnd, onDragMove, onDragStart, onPlace, thumbnail }: FurnitureButtonProps) {
  // panResponder は作り直さないので、最新の値は ref で読む
  const latest = useRef({ item, onDragEnd, onDragMove, onDragStart });
  latest.current = { item, onDragEnd, onDragMove, onDragStart };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 上へのドラッグだけを受け取る。横は一覧のスクロールに、タップは Pressable に任せる
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy < -LIFT_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: (_, gesture) => {
          latest.current.onDragStart(latest.current.item.kind, gesture.moveX, gesture.moveY);
        },
        onPanResponderMove: (_, gesture) => latest.current.onDragMove(gesture.moveX, gesture.moveY),
        onPanResponderRelease: (_, gesture) => latest.current.onDragEnd(gesture.moveX, gesture.moveY, false),
        onPanResponderTerminate: (_, gesture) => latest.current.onDragEnd(gesture.moveX, gesture.moveY, true),
        // 持ち上げている間は、一覧のスクロールに取られないようにする
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  return (
    // a11y-allow: panHandlers だけを渡しており、ラベルは含まない。読み上げは中の Pressable が担う
    <View style={{ opacity: isDragging ? 0.3 : 1 }} testID={`furniture-tray-${item.kind}`} {...panResponder.panHandlers}>
      <Pressable
        accessibilityHint="うえへ ドラッグすると、すきな ばしょに おけます"
        accessibilityLabel={`${item.label}を おく`}
        accessibilityRole="button"
        className="h-24 w-24 items-center justify-center rounded-2xl bg-white/90 py-2 active:bg-white"
        onPress={() => onPlace(item.kind)}
      >
        <FurnitureImage emoji={item.emoji} size={56} thumbnail={thumbnail} />
        <Text className="mt-1 text-xs font-bold text-slate-900">{item.label}</Text>
      </Pressable>
    </View>
  );
}

type FurnitureImageProps = {
  /** 絵が届くまで・描けなかったときに代わりに出す絵文字 */
  emoji: string;
  size: number;
  thumbnail?: string;
};

/** 家具の絵。絵が届いていなければ絵文字を出す */
export function FurnitureImage({ emoji, size, thumbnail }: FurnitureImageProps) {
  if (thumbnail) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: thumbnail }}
        style={{ height: size, width: size }}
        testID="furniture-thumbnail"
      />
    );
  }
  return (
    <View className="items-center justify-center" style={{ height: size, width: size }}>
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

type DraggedFurnitureProps = {
  /** 持ち上げている家具。持ち上げていなければ null */
  dragging: TrayDragState | null;
  /** 指に重ねる位置（画面の左上が原点）。useFurnitureTrayDrag が指に合わせて動かす */
  position: Animated.ValueXY;
  thumbnail?: string;
};

/**
 * 一覧から持ち上げて、指に重ねて出す家具。
 *
 * 部屋の上で置ける所があるときは、部屋の中の半透明の家具が置かれる位置を示すので、こちらは消す
 * （同じ家具が2つ見えて分かりにくいため）。置ける所が無いときは、部屋の上でも消さずに「おけないよ」と出す
 * （どちらも消すと、何も見えなくなって置けないことに気づけない。1R0Uレビュー指摘）。
 */
export function DraggedFurniture({ dragging, position, thumbnail }: DraggedFurnitureProps) {
  if (!dragging || (dragging.overRoom && dragging.canPlace)) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ left: 0, position: "absolute", top: 0, transform: position.getTranslateTransform() }}
      testID="dragged-furniture"
    >
      <View className="items-center">
        <FurnitureImage emoji={getPlaceableFurniture(dragging.kind).emoji} size={DRAGGED_FURNITURE_SIZE} thumbnail={thumbnail} />
        {dragging.overRoom ? (
          <View className="mt-1 rounded-full bg-white/90 px-2 py-0.5">
            <Text className="text-xs font-bold text-slate-900">おけないよ</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
