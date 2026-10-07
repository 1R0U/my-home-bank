import { useRef, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const MIN_SCALE = 1;
const MAX_SCALE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ZoomableMapProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * 全体マップをピンチで拡大・縮小できるようにする（Issue #314）。
 *
 * RN標準の `ScrollView` の `maximumZoomScale` 等はiOS専用で、Androidでは効かない
 * （CodeRabbitレビュー指摘）。導入済みの `react-native-gesture-handler`
 * （`GestureHandlerRootView` は app/_layout.tsx で既にルートを囲んでいる）の
 * `Gesture.Pinch()` を使い、両OSで同じように拡大・縮小できるようにする。
 *
 * `reanimated` は使わない（このコードベースでは未使用で、workletを増やすと
 * 複雑さが増す）。拡大率はプレーンな `useState` で持ち、ピンチ中の見た目の
 * なめらかさより実装の分かりやすさを優先する。パン（拡大したまま動かす）は
 * 対象外（最初のバージョンのため。中心に写っている物は常に見える）。
 */
export default function ZoomableMap({ children, style }: ZoomableMapProps) {
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  const pinch = Gesture.Pinch().onChange((event) => {
    const next = clamp(scaleRef.current * event.scaleChange, MIN_SCALE, MAX_SCALE);
    scaleRef.current = next;
    setScale(next);
  });

  return (
    <GestureDetector gesture={pinch}>
      <View style={[style, { transform: [{ scale }] }]}>{children}</View>
    </GestureDetector>
  );
}
