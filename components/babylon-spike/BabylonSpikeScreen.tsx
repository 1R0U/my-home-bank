import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BabylonSpikeView, type BabylonSpikeHandle } from "./BabylonSpikeView";
import { createSetBalanceIntent } from "../../lib/babylon-spike/bridge.ts";

// WebView + Babylon.js 方式のスパイク（Issue #151）。
// 検証専用ルート /babylon-spike。開発ナビ（app/dev-navigation.tsx）には載せず、
// URL 直打ちで到達する（docs/RPG_HUB_ENGINE_INVESTIGATION.md 参照）。
export default function BabylonSpikeScreen() {
  const spikeRef = useRef<BabylonSpikeHandle>(null);
  const [lastEvent, setLastEvent] = useState<string>("（まだイベントなし）");
  const [balance, setBalance] = useState(1250);

  const sendBalance = () => {
    const next = balance + 100;
    setBalance(next);
    spikeRef.current?.sendIntent(createSetBalanceIntent(next));
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={["top"]}>
      <View className="flex-1">
        <BabylonSpikeView
          ref={spikeRef}
          onEvent={(event) => setLastEvent(JSON.stringify(event))}
        />
      </View>
      <View className="gap-2 border-t border-slate-700 bg-slate-900 px-4 py-3">
        <Text className="text-xs text-slate-400">
          WebView → RN 最新イベント: <Text className="text-slate-200">{lastEvent}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-lg bg-indigo-500 py-3 active:opacity-80"
          onPress={sendBalance}
        >
          <Text className="font-bold text-white">残高を送る（RN → WebView: setBalance {balance + 100}）</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
