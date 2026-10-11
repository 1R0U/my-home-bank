import { useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const MIN_SCALE = 1;
const MAX_SCALE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Transform = { scale: number; translateX: number; translateY: number };

const INITIAL_TRANSFORM: Transform = { scale: 1, translateX: 0, translateY: 0 };

type ZoomableMapProps = {
  children: React.ReactNode;
  /** 表示する正方形の一辺（ピクセル）。パンの移動量をこの大きさを基準に制限する。 */
  size: number;
};

/**
 * 全体マップをピンチで拡大・縮小し、拡大したまま動かして見られるようにする（Issue #314）。
 *
 * RN標準の `ScrollView` の `maximumZoomScale` 等はiOS専用で、Androidでは効かない
 * （CodeRabbitレビュー指摘）。導入済みの `react-native-gesture-handler`
 * （`GestureHandlerRootView` は app/_layout.tsx と、Android向けにこのマップを
 * 囲む Modal の中にも置いてある）の `Gesture.Pinch()` / `Gesture.Pan()` を使い、
 * 両OSで同じように拡大・縮小・パンできるようにする。
 *
 * **`.runOnJS(true)` を必ず付けること（1R0Uさんレビュー指摘）。** reanimated / worklets が
 * 入っているため、付けないとコールバックがUIスレッド（worklet）で実行され、そこから
 * Reactのstate更新を呼ぶと実機で「非workletの関数をUIスレッドから同期的に呼んだ」
 * クラッシュになる。jestではピンチ自体を発生させないため、CIでは検出できない。
 *
 * 拡大率が1に近いほど、動かせる量（はみ出す分）は少ない。拡大しただけで動かせないと
 * 端の建物が見えなくなるため、`overflow: "hidden"` の枠の中で、はみ出した分だけ
 * 動かせるようにする（はみ出し量を超えて動かそうとしても、枠の外の余白が見えない範囲で止める）。
 */
export default function ZoomableMap({ children, size }: ZoomableMapProps) {
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM);
  const committedRef = useRef<Transform>(INITIAL_TRANSFORM);

  const clampTranslate = (scale: number, translateX: number, translateY: number): Transform => {
    // 拡大したぶん、中心から (scale-1)*size/2 だけ外側まで動かせる
    // （それ以上動かすと、枠の中に余白が見えてしまう）。
    const maxOffset = Math.max(0, (size * (scale - 1)) / 2);
    return {
      scale,
      translateX: clamp(translateX, -maxOffset, maxOffset),
      translateY: clamp(translateY, -maxOffset, maxOffset),
    };
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onChange((event) => {
      const next = clampTranslate(
        clamp(committedRef.current.scale * event.scaleChange, MIN_SCALE, MAX_SCALE),
        committedRef.current.translateX,
        committedRef.current.translateY,
      );
      committedRef.current = next;
      setTransform(next);
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onChange((event) => {
      const next = clampTranslate(
        committedRef.current.scale,
        committedRef.current.translateX + event.changeX,
        committedRef.current.translateY + event.changeY,
      );
      committedRef.current = next;
      setTransform(next);
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <View style={{ height: size, overflow: "hidden", width: size }}>
        <View
          style={{
            height: size,
            transform: [
              { translateX: transform.translateX },
              { translateY: transform.translateY },
              { scale: transform.scale },
            ],
            width: size,
          }}
        >
          {children}
        </View>
      </View>
    </GestureDetector>
  );
}
