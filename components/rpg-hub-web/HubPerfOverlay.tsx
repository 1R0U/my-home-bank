import { Text, View } from "react-native";

/**
 * 描画負荷の計測値を画面の隅に出す（Issue #200）。開発ビルドのときだけ出す。
 * タップは下の町へ通す（計測中も普段どおり操作できるように）。
 */
export default function HubPerfOverlay({ lines }: { lines: string[] }) {
  return (
    <View
      accessibilityElementsHidden
      className="absolute bottom-40 left-2 rounded-md bg-black/70 px-2 py-1"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="hub-perf-overlay"
    >
      {lines.map((line) => (
        <Text className="font-mono text-[10px] text-white" key={line}>
          {line}
        </Text>
      ))}
    </View>
  );
}
