import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { formatPerfStats } from "../../lib/rpg-hub/perfStats";
import type { HubPerfFeed } from "./useHubPerfStats";

/**
 * 描画負荷の計測値を画面の隅に出す（Issue #200）。開発ビルドのときだけ出す。
 * タップは下の町へ通す（計測中も普段どおり操作できるように）。
 *
 * 計測値はここで購読して、描き直しをこの部品の中だけに閉じ込める。
 * シーンの準備ができる（ready）までは何も出さない。
 */
export default function HubPerfOverlay({ feed }: { feed: HubPerfFeed }) {
  const [snapshot, setSnapshot] = useState(() => ({ startupMs: feed.startupMs, stats: feed.stats }));

  useEffect(() => {
    const update = () => setSnapshot({ startupMs: feed.startupMs, stats: feed.stats });
    // 購読を始めるまでに届いた分を取りこぼさない
    update();
    return feed.subscribe(update);
  }, [feed]);

  if (snapshot.startupMs === null) return null;

  return (
    <View
      accessibilityElementsHidden
      className="absolute bottom-40 left-2 rounded-md bg-black/70 px-2 py-1"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="hub-perf-overlay"
    >
      {formatPerfStats(snapshot.stats, snapshot.startupMs).map((line) => (
        <Text className="font-mono text-[10px] text-white" key={line}>
          {line}
        </Text>
      ))}
    </View>
  );
}
